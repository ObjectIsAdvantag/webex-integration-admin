//
// Copyright (c) 2016 Cisco Systems
// Licensed under the MIT License 
//

/*
 * a Webex Teams Integration based on Node.js, that acts on user's behalf.
 * implements the Webex OAuth flow, to retreive an API access tokens.
 * 
 * See documentation: https://developer.webex.com/authentication.html
 * 
 */

// Load environment variables from project .env file
require('node-env-file')(__dirname + '/.env');

const debug = require("debug")("oauth");
const fine = require("debug")("oauth:fine");

const request = require("request");
const express = require('express');
const app = express();


// Step 0: create an OAuth integration from https://developer.ciscospark.com/add-integration.html
//   - then fill in your Integration properties below
//
// A default proposed integration has been setup with:
//   - all available Webex scopes (except: spark:all)
//   - redirect URI to localhost:8080/oauth 
//
const clientId = process.env.CLIENT_ID || "C24ba23a9215b84f92b608ac72d664a4c0416e8c6c5575f64c438813d50ba1955";
const clientSecret = process.env.CLIENT_SECRET || "30a1fb7e62440b42336ae11978c6d58e32804071be3bf0c5a49743a105716d07";
const scopes = process.env.SCOPES || "spark:people_read"; // supported scopes are documented at: https://developer.webex.com/add-integration.html, the scopes separator is a space, example: "spark:people_read spark:rooms_read"

// Compute redirect URI where your integration is waiting for Webex cloud to redirect and send the authorization code
// unless provided via the REDIRECT_URI variable
const port = process.env.PORT || 8080;
let redirectURI = process.env.REDIRECT_URI
if (!redirectURI) {
   // Glitch hosting
   if (process.env.PROJECT_DOMAIN) {
      redirectURI = "https://" + process.env.PROJECT_DOMAIN + ".glitch.me/oauth";
   }
   else {
      // defaults to localhost
      redirectURI = `http://localhost:${port}/oauth`;
   }
}
debug(`OAuth integration settings:\n   - CLIENT_ID    : ${clientId}\n   - REDIRECT_URI : ${redirectURI}\n   - SCOPES       : ${scopes}`);


// Step 1: initiate the OAuth flow
//   - serves a Web page with a link to the Webex OAuth flow initializer
//
// Initiate the OAuth flow from the 'index.ejs' template  
// ------------------------------------------------------------- 
// -- Comment this section to initiate the flow from  static html page

// state can be used for security and/or correlation purposes
const state = process.env.STATE || "CiscoDevNet";

const initiateURL = "https://api.ciscospark.com/v1/authorize?"
   + "client_id=" + clientId
   + "&response_type=code"
   + "&redirect_uri=" + encodeURIComponent(redirectURI)
   + "&scope=" + encodeURIComponent(scopes)
   + "&state=" + state;

const read = require("fs").readFileSync;
const join = require("path").join;
const str = read(join(__dirname, '/www/index.ejs'), 'utf8');
const ejs = require("ejs");
const compiled = ejs.compile(str)({ "link": initiateURL }); // inject the link into the template

app.get("/index.html", function (req, res) {
   debug("serving the integration home page (generated from an EJS template)");
   res.send(compiled);
});

app.get("/", function (req, res) {
   res.redirect("/index.html");
});

// -------------------------------------------------------------
// Statically serve the "/www" directory
// WARNING: Do not move the 2 lines of code below, as we need this exact precedance order for the static and dynamic HTML generation to work correctly all together
//          If the section above is commented, the static index.html page will be served instead of the EJS template.
const path = require('path');
app.use("/", express.static(path.join(__dirname, 'www')));


// Step 2: process OAuth Authorization codes
//
app.get("/oauth", function (req, res) {
   debug("oauth callback hitted");

   // Did the user decline
   if (req.query.error) {
      if (req.query.error == "access_denied") {
         debug("user declined, received err: " + req.query.error);
         res.send("<h1>OAuth Integration could not complete</h1><p>Got your NO, ciao.</p>");
         return;
      }

      if (req.query.error == "invalid_scope") {
         debug("wrong scope requested, received err: " + req.query.error);
         res.send("<h1>OAuth Integration could not complete</h1><p>The application is requesting an invalid scope, Bye bye.</p>");
         return;
      }

      if (req.query.error == "server_error") {
         debug("server error, received err: " + req.query.error);
         res.send("<h1>OAuth Integration could not complete</h1><p>Webex sent a server error, Auf Wiedersehen.</p>");
         return;
      }

      debug("received err: " + req.query.error);
      res.send("<h1>OAuth Integration could not complete</h1><p>Error case not implemented, au revoir.</p>");
      return;
   }

   // Check request parameters correspond to the spec
   if ((!req.query.code) || (!req.query.state)) {
      debug("expected code & state query parameters are not present");
      res.send("<h1>OAuth Integration could not complete</h1><p>Unexpected query parameters, ignoring...</p>");
      return;
   }

   // Check State 
   // [NOTE] we implement a Security check below, but the State variable can also be leveraged for Correlation purposes
   if (state != req.query.state) {
      debug("State does not match");
      res.send("<h1>OAuth Integration could not complete</h1><p>Wrong secret, aborting...</p>");
      return;
   }

   // Retreive access token (expires in 14 days) & refresh token (expires in 90 days)
   //   { 
   //      "access_token":"N2MxMmE0YzgtMjY0MS00MDIxLWFmZDItNTg0MGVkOWEyNWQ3YmMzMmFlODItYzAy",
   //      "expires_in":1209599,
   //      "refresh_token":"NjBjNDk3MjktMjUwMy00YTlkLWJkOTctM2E2MjE3YWU1NmI4Njk3Y2IzODctMjBh",
   //      "refresh_token_expires_in":7775999
   //   }
   const options = {
      method: "POST",
      url: "https://api.ciscospark.com/v1/access_token",
      headers: {
         "content-type": "application/x-www-form-urlencoded"
      },
      form: {
         grant_type: "authorization_code",
         client_id: clientId,
         client_secret: clientSecret,
         code: req.query.code,
         redirect_uri: redirectURI
      }
   };
   request(options, function (error, response, body) {
      if (error) {
         debug("could not reach Webex cloud to retreive access & refresh tokens");
         res.send("<h1>OAuth Integration could not complete</h1><p>Sorry, could not retreive your access token. Try again...</p>");
         return;
      }

      if (response.statusCode != 200) {
         debug("access token not issued with status code: " + response.statusCode);
         switch (response.statusCode) {
            case 400:
               const responsePayload = JSON.parse(response.body);
               res.send("<h1>OAuth Integration could not complete</h1><p>Bad request. <br/>" + responsePayload.message + "</p>");
               break;
            case 401:
               res.send("<h1>OAuth Integration could not complete</h1><p>OAuth authentication error. Ask the service contact to check the secret.</p>");
               break;
            default:
               res.send("<h1>OAuth Integration could not complete</h1><p>Sorry, could not retreive your access token. Try again...</p>");
               break;
         }
         return;
      }

      // Check payload
      const json = JSON.parse(body);
      if ((!json) || (!json.access_token) || (!json.expires_in) || (!json.refresh_token) || (!json.refresh_token_expires_in)) {
         debug("could not parse access & refresh tokens");
         res.send("<h1>OAuth Integration could not complete</h1><p>Sorry, could not retreive your access token. Try again...</p>");
         return;
      }
      debug("OAuth flow completed, fetched tokens: " + JSON.stringify(json));

      // OAuth flow has completed
      oauthFlowCompleted(json, res);
   });
});


// Step 3: this is where the integration runs its custom logic
//   - this function is called as the OAuth flow has been successfully completed, 
//   - this function is expected to send back an HTML page to the end-user
//   
// some optional activities to perform here: 
//    - associate the issued access token to a user through the state (acting as a Correlation ID)
//    - store the refresh token (valid 90 days) to reissue later a new access token (valid 14 days)
function oauthFlowCompleted(json, res) {

   //
   // Custom logic below
   //

   const str = read(join(__dirname, '/www/show-tokens.ejs'), 'utf8');
   const compiled = ejs.compile(str)({ "accessToken": json.access_token, "refreshToken": json.refresh_token });
   res.send(compiled);
}


//
// Example of Refresh token usage
//
function refreshToken(token) {

   const options = {
      method: "POST",
      url: "https://api.ciscospark.com/v1/access_token",
      headers: {
         "content-type": "application/x-www-form-urlencoded"
      },
      form: {
         grant_type: "refresh_token",
         client_id: clientId,
         client_secret: clientSecret,
         refresh_token: refresh_token
      }
   };
   request(options, function (error, response, body) {
      if (error) {
         debug("could not reach Webex cloud to refresh access token");
         return;
      }

      if (response.statusCode != 200) {
         debug("access token not issued with status code: " + response.statusCode);
         return;
      }

      // Check payload
      const json = JSON.parse(body);
      if ((!json) || (!json.access_token) || (!json.expires_in) || (!json.refresh_token) || (!json.refresh_token_expires_in)) {
         debug("could not parse response");
         return;
      }

      // Refresh token obtained
      debug("newly issued tokens: " + JSON.stringify(json));
   });
}


function getLogoutURL(token, redirectURL) {
   const rootURL = redirectURL.substring(0, redirectURL.length - 5);
   return "https://idbroker.webex.com/idb/oauth2/v1/logout?"
      + "goto=" + encodeURIComponent(rootURL)
      + "&token=" + token;
}



// Starts the Webex Integration
app.listen(port, function () {
   console.log("Webex OAuth Integration started on port: " + port);
});