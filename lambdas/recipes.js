"use strict";
const AWS = require("aws-sdk");
const documentClient = new AWS.DynamoDB.DocumentClient();
const slugify = require("slugify");
const validator = require("validator");

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
	"Access-Control-Allow-Origin": "*", // Required for CORS support to work
	"Access-Control-Allow-Credentials": true // Required for cookies, authorization headers with HTTPS
};

const lambdaResponse = (statusCode, callback, data) => {
	callback(null, {
		statusCode: statusCode,
		headers: HEADERS,
		body: JSON.stringify(data)
	});
};

module.exports.createRecipe = (event, context, callback) => {
	const eventBodyJson = JSON.parse(event.body);
	const claims = event.requestContext.authorizer.claims;
	const userId = claims["cognito:username"];
	/* NOTE: When index table initially created add 1 item (record) with attribute counter with number value of 0  - counter is a dynamodb reserved word */
	/* update index and use the returned value for recipeId of new item */
	const indexParams = {
		Key: {
			id: 1
		},
		UpdateExpression: "set #counter = #counter + :countVal",
		ExpressionAttributeNames: {
			"#counter": "counter"
		},
		ExpressionAttributeValues: {
			":countVal": 1
		},
		ReturnValues: "UPDATED_NEW",
		TableName: process.env.INDEX_TABLE_NAME
	};
	// sanitize ingredients
	let sanitizedIngredients = [];
	if (eventBodyJson.ingredients.length > 0) {
		sanitizedIngredients = eventBodyJson.ingredients.map(ingredient => {
			const name = validator.escape(ingredient.name);
			const amount = validator.escape(ingredient.amount);
			return { name, amount };
		});
	}
	/* create item (record) */
	let createItemParams = {
		ConditionExpression: "attribute_not_exists(recipeId)",
		Item: {
			userId: validator.escape(userId),
			createdAt: new Date().getTime() + "",
			updatedAt: new Date().getTime() + "",
			recipeName: validator.escape(eventBodyJson.recipeName),
			slug: slugify(eventBodyJson.recipeName, {
				replacement: "-",
				remove: /[*+~.()'"!:@]/g,
				lower: true
			}),
			ingredients: sanitizedIngredients, // [{name: '', amount: ''},{name: '', amount: ''}]
			instructions: validator.escape(eventBodyJson.instructions)
		},
		TableName: process.env.RECIPES_TABLE_NAME
		// ReturnValues: "ALL_OLD" // Doesn't work as no current item
	};
	// optional image
	if (eventBodyJson.image) {
		createItemParams.Item.image = validator.escape(eventBodyJson.image);
	}
	documentClient.update(indexParams, function(err, data) {
		if (err) {
			console.log(err);
			lambdaResponse(422, callback, err);
			return;
		}
		const recipeId = (createItemParams.Item.recipeId = data.Attributes.counter);
		documentClient.put(createItemParams, function(err, data) {
			if (err) {
				if (err.code === "ConditionalCheckFailedException") {
					console.error(err);
					lambdaResponse(400, callback, {
						message: "Recipe already exists"
					});
				} else {
					console.error(err);
					lambdaResponse(400, callback, err);
				}
			} else {
				// return newly created item
				const getParams = {
					Key: {
						recipeId: Number(recipeId),
						userId: userId
					},
					TableName: process.env.RECIPES_TABLE_NAME
				};
				documentClient.get(getParams, function(err, data) {
					if (err) {
						// console.log(err, err.stack);
						lambdaResponse(422, callback, err);
					} else {
						console.log("data", data);
						lambdaResponse(200, callback, data);
					}
				});
			}
		});
	});
};

module.exports.getRecipesByUser = (event, context, callback) => {
	const claims = event.requestContext.authorizer.claims;
	const userId = claims["cognito:username"];

	const params = {
		IndexName: "recipesGlobalSecondaryIndex",
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
		if (err) {
			console.error(err);
			lambdaResponse(400, callback, err);
		} else {
			// console.log('data', data);
			lambdaResponse(200, callback, data);
		}
	});
};

module.exports.getRecipeByUser = (event, context, callback) => {
	const recipeId = event.pathParameters.id;
	const claims = event.requestContext.authorizer.claims;
	const userId = claims["cognito:username"];

	const params = {
		IndexName: "recipesGlobalSecondaryIndex",
		KeyConditionExpression: "#HashKey = :hkey AND #RangeKey = :rkey",
		ExpressionAttributeNames: {
			"#HashKey": "userId",
			"#RangeKey": "recipeId"
		},
		ExpressionAttributeValues: {
			":hkey": userId,
			":rkey": Number(recipeId)
		},
		TableName: process.env.RECIPES_TABLE_NAME
	};

	documentClient.query(params, function(err, data) {
		if (err) {
			console.error(err);
			lambdaResponse(400, callback, err);
		} else {
			// console.log('data', data);
			lambdaResponse(200, callback, data);
		}
	});
};

module.exports.updateRecipeByUser = (event, context, callback) => {
	const recipeId = event.pathParameters.id;
	const eventBodyJson = JSON.parse(event.body);
	const claims = event.requestContext.authorizer.claims;
	const userId = claims["cognito:username"];

	// sanitize ingredients
	let sanitizedIngredients = [];
	if (eventBodyJson.ingredients.length > 0) {
		sanitizedIngredients = eventBodyJson.ingredients.map(ingredient => {
			const name = validator.escape(ingredient.name);
			const amount = validator.escape(ingredient.amount);
			return { name, amount };
		});
	}

	const params = {
		Key: {
			recipeId: Number(recipeId),
			userId: userId
		},
		ConditionExpression: "attribute_exists(recipeId)",
		UpdateExpression:
			"set #img = :a, #ings = :b, #instrs = :c, #rName = :d, #slug = :e, #uAt = :f",
		ExpressionAttributeNames: {
			"#img": "image",
			"#ings": "ingredients",
			"#instrs": "instructions",
			"#rName": "recipeName",
			"#slug": "slug",
			"#uAt": "updatedAt"
		},
		ExpressionAttributeValues: {
			":a": validator.escape(eventBodyJson.image),
			":b": sanitizedIngredients,
			":c": validator.escape(eventBodyJson.instructions),
			":d": validator.escape(eventBodyJson.recipeName),
			":e": slugify(validator.escape(eventBodyJson.recipeName), {
				replacement: "-",
				remove: /[*+~.()'"!:@]/g,
				lower: true
			}),
			":f": new Date().getTime() + ""
		},
		TableName: process.env.RECIPES_TABLE_NAME,
		ReturnValues: "ALL_NEW"
	};

	documentClient.update(params, function(err, data) {
		if (err) {
			console.log(err);
			lambdaResponse(404, callback, err);
		} else {
			// console.log('data', data);
			lambdaResponse(200, callback, data);
		}
	});
};

module.exports.deleteRecipeByUser = (event, context, callback) => {
	const recipeId = event.pathParameters.id;
	const claims = event.requestContext.authorizer.claims;
	const userId = claims["cognito:username"];

	const params = {
		Key: {
			recipeId: Number(recipeId),
			userId: userId
		},
		ConditionExpression: "attribute_exists(recipeId)",
		TableName: process.env.RECIPES_TABLE_NAME,
		ReturnValues: "ALL_OLD"
	};

	documentClient.delete(params, function(err, data) {
		if (err) {
			console.log(err);
			lambdaResponse(404, callback, err);
		} else {
			// console.log('data', data);
			lambdaResponse(200, callback, data);
		}
	});
};
