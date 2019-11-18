'use strict';
const AWS = require("aws-sdk");
const documentClient = new AWS.DynamoDB.DocumentClient();

/*
400	Bad Request
401	Unauthorized
403	Forbidden
404	Not Found
422	Unprocessable Entity
500	Internal Server Error
502	Bad Gateway
504	Gateway Timeout
*/

const HEADERS = {
  "content-type": "application/json",
  "Access-Control-Allow-Origin": "*", 			// Required for CORS support to work
  "Access-Control-Allow-Credentials": true	// Required for cookies, authorization headers with HTTPS
};

const lambdaResponse = (statusCode, callback, data) => {
	callback(null, {
		statusCode: statusCode,
		headers: HEADERS,
		body: JSON.stringify(data),
	});
};

module.exports.createRecipe = (event, context, callback) => {
  const eventBodyJson = JSON.parse(event.body);
  const claims = event.requestContext.authorizer.claims;
  const userId = claims['cognito:username'];

  const params = {
    ConditionExpression: 'attribute_not_exists(recipeId)',
    Item: {
      "userId": userId,
      "createdAt" :  new Date().getTime() + "",
      "updatedAt" :  new Date().getTime() + "",
      // "userIdFilterField": {
      // S: userId
      // },
      "recipeId": eventBodyJson.recipeId,
      "ingredients": [...eventBodyJson.ingredients], // {name: '', amount: ''}
      "instructions": eventBodyJson.instructions,
      "image": eventBodyJson.image
    },
    TableName: process.env.RECIPES_TABLE_NAME,
  };

  documentClient.put(params, function(err, data) {
    if( err ) {
      if( err.code === "ConditionalCheckFailedException" ) {
        console.error(err);
        lambdaResponse(400, callback, {
          message: "Recipe already exists"
        });
      } else {
        // console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
        console.error(err);
        lambdaResponse(400, callback, err);
      }
    } else {
      // console.log("Added item:", JSON.stringify(data, null, 2));
      console.log('data', data);
      lambdaResponse(200, callback, data);
    }
  });

};


module.exports.getRecipesByUser = (event, context, callback) => {
  // const eventBodyJson = JSON.parse(event.body);
  const claims = event.requestContext.authorizer.claims;
  const userId = claims['cognito:username'];

  // const params = {
  //   TableName: process.env.RECIPES_TABLE_NAME,
  //   // ExpressionAttributeNames: {
  //   //     "#userIdFilterField": "userIdFilterField"
  //   // },
  //   // ExpressionAttributeValues: {
  //   //     ":userIdFilterField": username
  //   // },
  //   // FilterExpression: "#userIdFilterField = :userIdFilterField"
  // };

  const params = {
    IndexName: 'recipesGlobalSecondaryIndex',
    KeyConditionExpression: "#HashKey = :hkey",
    ExpressionAttributeNames: {
      "#HashKey": "userId"
    },
    ExpressionAttributeValues: {
      ":hkey": userId
    },
    TableName: process.env.RECIPES_TABLE_NAME
  };

  documentClient.query(params, function(err, data) {
    if( err ) {
      // console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
      console.error(err);
      lambdaResponse(400, callback, err);
    } else {
      // console.log("Added item:", JSON.stringify(data, null, 2));
      console.log('data', data);
      lambdaResponse(200, callback, data);
    }
  });

};

// module.exports.getRecipe = (event, context, callback) => {
//   // console.log('EVENT', event);
//   // console.log('CONTEXT', context);
//   // const eventBodyJson = JSON.parse(event.body);
//   // const claims = event.requestContext;
//   // const username = claims['cognito:username'];
//   const params = {
//     TableName: process.env.RECIPES_TABLE_NAME,
//     Key: {
//       "recipeId": event.pathParameters.id
//     },
//   };
//   documentClient.get(params, function(err, data) {
//     if (err) {
//       console.log('dynamodb error' + err);
//       callback(err);
//     }
//     else {
//       // console.log(data);
//       const response = {
//         statusCode: 200,
//         headers: {
//           "Access-Control-Allow-Origin": "*", // Required for CORS support to work
//           "Access-Control-Allow-Credentials": true // Required for cookies, authorization headers with HTTPS
//         },
//         body: JSON.stringify(data)
//       };
//       callback(null, response);
//     }
//   });
// }