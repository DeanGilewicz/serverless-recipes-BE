'use strict';
const AWS = require("aws-sdk");
const documentClient = new AWS.DynamoDB.DocumentClient();

module.exports.getAll = (event, context, callback) => {
  const eventBodyJson = JSON.parse(event.body);
  // const claims = event.requestContext.authorizer.claims;
  // const username = claims['cognito:username'];

  console.log("eventBodyJson", eventBodyJson);
  // console.log("context", context);
  // console.log("claims", claims)

  const params = {
      TableName: "r-recipes-dev",
      // ExpressionAttributeNames: {
      //     "#userIdFilterField": "userIdFilterField"
      // },
      // ExpressionAttributeValues: {
      //     ":userIdFilterField": username
      // },
      // FilterExpression: "#userIdFilterField = :userIdFilterField"
  };

  console.log("params", params);

  documentClient.scan(params, (err, data) => {
    if( err ) {
      console.log("dynamodb error" + err);
      callback(err);
    } else {
      // console.log("data", data);
      const response = {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*", // Required for CORS support to work
          "Access-Control-Allow-Credentials": true // Required for cookies, authorization headers with HTTPS
        },
        body: JSON.stringify(data)
      };
      callback(null, response);
    }
  });

};
