require('dotenv').config();

var express = require('express');
const RC = require('@ringcentral/sdk').SDK;

const PORT= process.env.PORT;
const REDIRECT_HOST= process.env.REDIRECT_HOST;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const RINGCENTRAL_ENV= process.env.RINGCENTRAL_ENV;
const RINGCENTRAL_CODE=process.env.RINGCENTRAL_CODE;

let app = express();
let platform, subscription, rcsdk, subscriptionId;

app.listen(PORT, function () {
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Example app listening on port " + PORT);
});


app.get('/', function(req, res) {
    res.send('Ngrok is working! Path Hit: ' + req.url);
});


rcsdk = new RC({
    server: RINGCENTRAL_ENV,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: REDIRECT_HOST + '/oauth'
});

platform = rcsdk.platform();

app.get('/oauth', async function (req, res) {
    console.log(req.query);
    if (req.query.code != null) {
        try {
            let resp = await platform.login({
                code: req.query.code,
                redirectUri: REDIRECT_HOST + '/oauth'
            })
            console.log(resp.json())
            res.send(resp.json());
        } catch (e) {
            res.send('Login error ' + e);
            throw new Error(e);
        }
    } else {
        console.log('No Auth code');
        res.send('No Auth code');
    }
});

app.post('/callback', function (req, res) {
    var validationToken = req.get('Validation-Token');
    var body =[];

    if(validationToken) {
        console.log('Responding to RingCentral as last leg to create new Webhook');
        res.setHeader('Validation-Token', validationToken);
        res.statusCode = 200;
        res.end();
    } else {
        req.on('data', function(chunk) {
            body.push(chunk);
        }).on('end', function() {
            body = Buffer.concat(body).toString();
            console.log('WEBHOOK EVENT BODY: ', body);
            var obj = JSON.parse(body);
            res.statusCode = 200;
            res.end(body);
            if(obj.event == "/restapi/v1.0/subscription/~?threshold=60&interval=15"){
                renewSubscription(obj.subscriptionId);
            }
        });
    }
});

app.post('/post', function (req, res) {
    var body =[];
    req.on('data', function(chunk) {
        body.push(chunk);
    }).on('end', function() {
        body = Buffer.concat(body).toString();
        var obj = JSON.parse(body);
        post_text_message(obj.chatId, obj.text);
    });
    res.send()
});

function post_text_message(chat_id, text) {
    console.log(chat_id);
    console.log(text);
    platform.post('/restapi/v1.0/glip/chats/'+chat_id+'/posts', {
        text: text
    }).then(function(resp){
        var json = resp.json()
        var id = json['id']
        console.log("Posted message successfully, id: " + id)
    }).catch(function(e){
        console.log(e)
    })
}

function subscribeToGlipEvents(token){

    var requestData = {
        "eventFilters": [
            "/restapi/v1.0/glip/posts",
            "/restapi/v1.0/glip/groups",
            "/restapi/v1.0/subscription/~?threshold=60&interval=15"
        ],
        "deliveryMode": {
            "transportType": "WebHook",
            "address": REDIRECT_HOST + "/callback"
        },
        "expiresIn": 604799
    };
    platform.post('/subscription', requestData)
        .then(function (subscriptionResponse) {
            console.log('Subscription Response: ', subscriptionResponse.json());
            subscription = subscriptionResponse;
            subscriptionId = subscriptionResponse.id;
        }).catch(function (e) {
            console.error(e);
            throw e;
    });
}

function renewSubscription(id){
    console.log("Renewing Subscription");
    platform.post('/subscription/' + id + "/renew")
        .then(function(response){
            var data = JSON.parse(response.text());
            subscriptionId = data.id
            console.log("Subscription Renewal Successfull. Next Renewal scheduled for:" + data.expirationTime);
        }).catch(function(e) {
            console.error(e);
            throw e;
        });
}
