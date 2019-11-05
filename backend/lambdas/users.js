'use strict';
const AWS = require("aws-sdk");
const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider({ apiVersion: '2016-04-18' });
const documentClient = new AWS.DynamoDB.DocumentClient();

module.exports.createUser = (event, context, callback) => {
	const eventBodyJson = JSON.parse(event.body);
  // const claims = event.requestContext.authorizer.claims;
  // const username = claims['cognito:username'];

	console.log("eventBodyJson", eventBodyJson);
	// console.log("claims", claims);
	// console.log("username: ", username);
	console.log("context", context);

	// const params = {
  //   TableName: process.env.USER_TABLE_NAME,
	// 	Item: {
	// 		"userId": {
	// 			S: userId
	// 		},
	// 		"firstName": {
	// 			S: registrationJson.firstName
	// 		},
	// 		"lastName": {
	// 			S: registrationJson.lastName
	// 		},
	// 		"streetAddress": {
	// 			S: registrationJson.streetAddress
	// 		},
	// 		"city": {
	// 			S: registrationJson.city
	// 		},
	// 		"state": {
	// 			S: registrationJson.state
	// 		},
	// 		"zip": {
	// 			S: registrationJson.zip
	// 		}
	// 	}
  // };

	var params = {
		ClientId: process.env.AWS_APP_CLIENT_ID,
		Password: eventBodyJson.password,
		Username: eventBodyJson.emailAddress,
		// Anything set as required in Cognito pool needs to be in the UserAttributes section
		UserAttributes: [
			{
				Name: 'email',
				Value: eventBodyJson.emailAddress
			},
			// {
			// 	Name: 'first_name',
			// 	Value: ''
			// },
			// {
			// 	Name: 'last_name',
			// 	Value: ''
			// }
		]
	};

	cognitoIdentityServiceProvider.signUp(params, function(err, data) {
		if( err ) {
			console.error(err, err.stack);
			return;
		}
		const response = {
			statusCode: 200,
			headers: {
				"Access-Control-Allow-Origin": "*", 			// Required for CORS support to work
				"Access-Control-Allow-Credentials": true	// Required for cookies, authorization headers with HTTPS
			},
			body: JSON.stringify(data),
		};
		callback(null, response);
	});

};
