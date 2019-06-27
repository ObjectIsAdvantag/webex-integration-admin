//
// Copyright (c) 2019 Cisco Systems
// Licensed under the MIT License 
//

/*
 * List devices
 * 
 */

var request = require("request");

var options = {
   method: "GET",
   url: "https://api.ciscospark.com/v1/devices",
   headers:
   {
      Authorization: "Bearer " + process.env.ACCESS_TOKEN
   }
};

request(options, function (error, response, body) {
   if (error) throw new Error(error);

   console.log(body);
});
