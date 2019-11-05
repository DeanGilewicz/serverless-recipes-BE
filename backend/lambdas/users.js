'use strict';
const AWS = require("aws-sdk");
const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider({ apiVersion: '2016-04-18' });
const documentClient = new AWS.DynamoDB.DocumentClient();

module.exports.createUser = (event, context, callback) => {
	const eventBodyJson = JSON.parse(event.body);

	const params = {
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

module.exports.confirmUser = (event, context, callback) => {
	const eventBodyJson = JSON.parse(event.body);

	var params = {
		ClientId: process.env.AWS_APP_CLIENT_ID,
		ConfirmationCode: eventBodyJson.confirmationCode,
		Username: eventBodyJson.emailAddress
	};

	cognitoIdentityServiceProvider.confirmSignUp(params, function(err, data) {
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