'use strict';
const AWS = require("aws-sdk");
const documentClient = new AWS.DynamoDB.DocumentClient();
const slugify = require("slugify");
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
      "recipeId": eventBodyJson.recipeId,
      "slug": slugify(eventBodyJson.recipeId, {
        replacement: '-',
        remove: /[*+~.()'"!:@]/g,
        lower: true
      }),
      "ingredients": [...eventBodyJson.ingredients], // {name: '', amount: ''}
      "instructions": eventBodyJson.instructions,
      "image": eventBodyJson.image
    },
    TableName: process.env.RECIPES_TABLE_NAME
  };

  documentClient.put(params, function(err, data) {
    if( err ) {
      if( err.code === "ConditionalCheckFailedException" ) {
        console.error(err);
        lambdaResponse(400, callback, {
          message: "Recipe already exists"
        });
      } else {
        console.error(err);
        lambdaResponse(400, callback, err);
      }
    } else {
      // console.log('data', data);
      lambdaResponse(200, callback, data);
    }
  });

};

module.exports.getRecipesByUser = (event, context, callback) => {
  const claims = event.requestContext.authorizer.claims;
  const userId = claims['cognito:username'];

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
      console.error(err);
      lambdaResponse(400, callback, err);
    } else {
      // console.log('data', data);
      lambdaResponse(200, callback, data);
    }
  });

};

module.exports.getRecipeByUser = (event, context, callback) => {
  const slug = event.pathParameters.slug;
  const claims = event.requestContext.authorizer.claims;
  const userId = claims['cognito:username'];

  const params = {
    IndexName: 'recipesGlobalSecondaryIndex',
    KeyConditionExpression: "#HashKey = :hkey AND #RangeKey = :rkey",
    ExpressionAttributeNames: {
      "#HashKey": "userId",
      "#RangeKey": "slug"
    },
    ExpressionAttributeValues: {
      ":hkey": userId,
      ":rkey": slug
    },
    TableName: process.env.RECIPES_TABLE_NAME
  };

  documentClient.query(params, function(err, data) {
    if( err ) {
      console.error(err);
      lambdaResponse(400, callback, err);
    } else {
      // console.log('data', data);
      lambdaResponse(200, callback, data);
    }
  });

};