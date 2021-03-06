"use strict";

global.fetch = require("node-fetch");
global.navigator = () => null;

const AWS = require("aws-sdk");
const AmplifyCore = require("aws-amplify");
const jwt = require("jsonwebtoken");
const validator = require("validator");

const AmplifyDefault = AmplifyCore.default;
const AmplifyAuth = AmplifyCore.Auth;
const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();

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
	// "Access-Control-Allow-Headers":
	// "Content-Type,X-Amz-Date,Authorization,X-Api-Key,x-requested-with",
	// "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
	// "Access-Control-Allow-Origin": "*", // Required for CORS support to work
	"Access-Control-Allow-Origin": process.env.FE_WEBSITE_DOMAIN,
	"Access-Control-Allow-Credentials": true // Required for cookies, authorization headers with HTTPS
};

const lambdaResponse = (statusCode, callback, data) => {
	callback(null, {
		statusCode: statusCode,
		headers: HEADERS,
		body: JSON.stringify(data)
	});
};

AmplifyDefault.configure({
	Auth: {
		// REQUIRED only for Federated Authentication - Amazon Cognito Identity Pool ID
		//identityPoolId: 'XX-XXXX-X:XXXXXXXX-XXXX-1234-abcd-1234567890ab',

		// REQUIRED - Amazon Cognito Region
		region: process.env.AWS_THE_REGION,

		// OPTIONAL - Amazon Cognito Federated Identity Pool Region
		// Required only if it's different from Amazon Cognito Region
		//identityPoolRegion: 'XX-XXXX-X',

		// OPTIONAL - Amazon Cognito User Pool ID
		userPoolId: process.env.AWS_USER_POOL_ID,

		// OPTIONAL - Amazon Cognito Web Client ID (26-char alphanumeric string)
		userPoolWebClientId: process.env.AWS_APP_CLIENT_ID

		// OPTIONAL - Enforce user authentication prior to accessing AWS resources or not
		//mandatorySignIn: false,

		// OPTIONAL - Configuration for cookie storage
		// Note: if the secure flag is set to true, then the cookie transmission requires a secure protocol
		// cookieStorage: {
		// // REQUIRED - Cookie domain (only required if cookieStorage is provided)
		// 		domain: '.yourdomain.com',
		// // OPTIONAL - Cookie path
		// 		path: '/',
		// // OPTIONAL - Cookie expiration in days
		// 		expires: 365,
		// // OPTIONAL - Cookie secure flag
		// // Either true or false, indicating if the cookie transmission requires a secure protocol (https).
		// 		secure: true
		// },

		// OPTIONAL - customized storage object
		//storage: new MyStorage(),

		// OPTIONAL - Manually set the authentication flow type. Default is 'USER_SRP_AUTH'
		//authenticationFlowType: 'USER_PASSWORD_AUTH',

		// OPTIONAL - Manually set key value pairs that can be passed to Cognito Lambda Triggers
		//clientMetadata: { myCustomKey: 'myCustomValue' }
	}
});

module.exports.authorization = (event, context, callback) => {
	// read headers to access JWTs
	const token = event.headers.Authorization;
	const refreshToken = event.headers["x-custom-token"];
	// if no idToken or accessToken passed (will most likely not get here since API Gateway will return an Unauthorized error)
	if (!token) {
		lambdaResponse(401, callback, {
			message: "Unauthorized"
		});
	}
	// decode token
	const tokenDecoded = jwt.decode(token);
	if (new Date().getTime() >= tokenDecoded.exp * 1000) {
		// expired so invoke auth fn
		const params = {
			AuthFlow: "REFRESH_TOKEN_AUTH",
			ClientId: process.env.AWS_APP_CLIENT_ID,
			// AnalyticsMetadata: {
			// 	AnalyticsEndpointId: "STRING_VALUE"
			// },
			AuthParameters: {
				REFRESH_TOKEN: refreshToken // JWT has no payload
			}
			// ClientMetadata: {
			// 	"<StringType>": "STRING_VALUE"
			// 	/* '<StringType>': ... */
			// },
			// UserContextData: {
			// 	EncodedData: "STRING_VALUE"
			// }
		};
		cognitoIdentityServiceProvider.initiateAuth(params, function(err, data) {
			if (err) {
				// refresh token invalid - need to reauthenticate
				console.error(err);
				lambdaResponse(401, callback, {
					message: "Unauthorized"
				});
			} else {
				// return the new access and id tokens
				lambdaResponse(200, callback, data);
			}
		});
	} else {
		// not expired so keep tokens
		lambdaResponse(200, callback, {
			message: "Authorized"
		});
	}
};

module.exports.createUser = (event, context, callback) => {
	const eventBodyJson = JSON.parse(event.body);
	AmplifyAuth.signUp({
		username: validator.escape(eventBodyJson.emailAddress),
		password: validator.escape(eventBodyJson.password),
		attributes: {
			// aws default attributes
			// address
			// birthdate
			email: validator.escape(eventBodyJson.emailAddress), // required
			family_name: validator.escape(eventBodyJson.lastName), // required
			// gender
			// given_name
			// locale
			// middle_name
			name: validator.escape(eventBodyJson.firstName), // required
			// nickname
			// phone_number
			picture: validator.escape(eventBodyJson.picture).replace(/&#x2f;/gi, "/")
			// preferred_username
			// profile
			// timezone
			// updated_at
			// website
			// other custom attributes
		}
		// validationData: []  // optional
	})
		.then(data => {
			lambdaResponse(200, callback, data);
		})
		.catch(err => {
			console.error(err);
			lambdaResponse(400, callback, err.message);
		});
};

module.exports.confirmUser = (event, context, callback) => {
	const eventBodyJson = JSON.parse(event.body);
	const username = eventBodyJson.username;
	const confirmationCode = eventBodyJson.confirmationCode;
	AmplifyAuth.confirmSignUp(username, confirmationCode, {
		// Optional. Force user confirmation irrespective of existing alias. By default set to True.
		forceAliasCreation: true
	})
		.then(data => {
			lambdaResponse(200, callback, data);
		})
		.catch(err => {
			if (err.code === "CodeMismatchException") {
				// The error happens when the verification code is invalid
				console.error(err);
				lambdaResponse(400, callback, err.message);
			} else if (err.code === "UserNotFoundException") {
				// The error happens when the username is invalid
				console.error(err);
				lambdaResponse(400, callback, err.message);
			} else {
				console.error(err);
				lambdaResponse(404, callback, err);
			}
		});
};

module.exports.resendConfirmation = (event, context, callback) => {
	const eventBodyJson = JSON.parse(event.body);
	const username = eventBodyJson.username;
	AmplifyAuth.resendSignUp(username)
		.then(() => {
			lambdaResponse(200, callback, { message: "Sign up resent" });
		})
		.catch(err => {
			console.error(err);
			lambdaResponse(404, callback, err);
		});
};

module.exports.forgotPassword = (event, context, callback) => {
	const eventBodyJson = JSON.parse(event.body);
	const username = eventBodyJson.username;
	AmplifyAuth.forgotPassword(username)
		.then(data => {
			// nothing useful in response
			lambdaResponse(200, callback, {
				message: "Password Reset Sent"
			});
		})
		.catch(err => {
			console.error(err);
			lambdaResponse(404, callback, err.message);
		});
};

module.exports.forgotPasswordConfirm = (event, context, callback) => {
	const clientId = process.env.AWS_APP_CLIENT_ID;
	const eventBodyJson = JSON.parse(event.body);
	const confirmationCode = eventBodyJson.confirmationCode;
	const password = validator.escape(eventBodyJson.password);
	const username = eventBodyJson.username;

	const params = {
		ClientId: clientId,
		ConfirmationCode: confirmationCode,
		Password: password,
		Username: username
		// AnalyticsMetadata: {
		// 	AnalyticsEndpointId: 'STRING_VALUE'
		// },
		// ClientMetadata: {
		// 	'<StringType>': 'STRING_VALUE',
		// 	/* '<StringType>': ... */
		// },
		// SecretHash: 'STRING_VALUE',
		// UserContextData: {
		// 	EncodedData: 'STRING_VALUE'
		// }
	};
	cognitoIdentityServiceProvider.confirmForgotPassword(params, function(
		err,
		data
	) {
		if (err) {
			if (err.code === "CodeMismatchException") {
				console.error(err, err.stack);
				lambdaResponse(404, callback, err.message);
			} else if (err.code === "UserNotFoundException") {
				console.error(err, err.stack);
				lambdaResponse(404, callback, err.message);
			} else {
				console.error(err, err.stack);
				lambdaResponse(400, callback, err.message);
			}
		} else {
			// nothing useful in response
			lambdaResponse(200, callback, {
				message: "Password Reset Success"
			});
		}
	});
};

module.exports.login = (event, context, callback) => {
	const eventBodyJson = JSON.parse(event.body);
	const username = eventBodyJson.username;
	const password = eventBodyJson.password;

	AmplifyAuth.signIn(username, password)
		.then(user => {
			// The user directly signs in
			const accessToken = user.signInUserSession.accessToken.jwtToken;
			const idToken = user.signInUserSession.idToken.jwtToken;
			const refreshToken = user.signInUserSession.refreshToken.token;
			const accessTokenDecoded = jwt.decode(accessToken);
			const expiration = accessTokenDecoded.exp * 1000;
			const modifiedUserResponse = {
				auth: {
					accessToken,
					idToken,
					refreshToken,
					expiration
				},
				emailVerified: user.attributes.email_verified,
				emailAddress: user.attributes.email,
				firstName: user.attributes.name,
				lastName: user.attributes.family_name
			};
			const response = {
				user: modifiedUserResponse
			};
			lambdaResponse(200, callback, response);
		})
		.catch(err => {
			if (err.code === "UserNotConfirmedException") {
				// The error happens if the user didn't finish the confirmation step when signing up
				// In this case you need to resend the code and confirm the user
				console.error(err);
				AmplifyAuth.resendSignUp(username)
					.then(() => {
						lambdaResponse(200, callback, { message: "Sign up resent" });
					})
					.catch(err => {
						console.error(err);
						lambdaResponse(404, callback, err);
					});
			} else if (err.code === "PasswordResetRequiredException") {
				// The error happens when the password is reset in the Cognito console
				// In this case you need to call forgotPassword to reset the password
				console.error(err);
				AmplifyAuth.forgotPassword(username)
					.then(data => {
						lambdaResponse(200, callback, data);
					})
					.catch(err => {
						console.error(err);
						lambdaResponse(404, callback, err);
					});
			} else if (err.code === "NotAuthorizedException") {
				// The error happens when the incorrect password is provided
				console.error(err);
				lambdaResponse(404, callback, err.message);
			} else if (err.code === "UserNotFoundException") {
				// The error happens when the supplied username/email does not exist in the Cognito user pool
				console.error(err);
				lambdaResponse(404, callback, err.message);
			} else {
				console.error(err);
				lambdaResponse(400, callback, err);
			}
		});
};

module.exports.changePassword = (event, context, callback) => {
	const eventBodyJson = JSON.parse(event.body);
	const currentPassword = validator.escape(eventBodyJson.currentPassword);
	const newPassword = validator.escape(eventBodyJson.newPassword);
	const accessToken = eventBodyJson.accessToken;
	const params = {
		AccessToken: accessToken,
		PreviousPassword: currentPassword,
		ProposedPassword: newPassword
	};
	cognitoIdentityServiceProvider.changePassword(params, function(err, data) {
		if (err) {
			console.error(err, err.stack);
			lambdaResponse(400, callback, err);
		} else {
			// {}
			lambdaResponse(200, callback, {
				message: "Password Change Success"
			});
		}
	});
};

module.exports.updateUser = (event, context, callback) => {
	const eventBodyJson = JSON.parse(event.body);
	// sanitize user attrs
	let sanitizedUserAttributes = [];
	if (eventBodyJson.userAttributes.length > 0) {
		sanitizedUserAttributes = eventBodyJson.userAttributes.map(attribute => {
			const name = validator.escape(attribute.Name);
			const amount = validator.escape(attribute.Value);
			return { name, amount };
		});
	}
	const userAttributes = sanitizedUserAttributes;
	const accessToken = eventBodyJson.accessToken;
	const params = {
		AccessToken: accessToken,
		UserAttributes: userAttributes
		// ClientMetadata: {
		// 	'<StringType>': 'STRING_VALUE',
		// 	/* '<StringType>': ... */
		// }
	};
	cognitoIdentityServiceProvider.updateUserAttributes(params, function(
		err,
		data
	) {
		if (err) {
			if (err.code === "InvalidParameterException") {
				console.error(err, err.stack);
				lambdaResponse(400, callback, err.message);
			} else {
				console.error(err, err.stack);
				lambdaResponse(400, callback, err);
			}
		} else {
			// {}
			// lambdaResponse(200, callback, data); // returns empty obj
			cognitoIdentityServiceProvider.getUser(
				{ AccessToken: accessToken },
				function(err, updatedUser) {
					if (err) {
						console.error(err, err.stack);
						lambdaResponse(400, callback, err.message);
					}
					// clean up response data
					const modifiedUserResponse = {};
					updatedUser.UserAttributes.forEach(attribute => {
						if (attribute.Name !== "sub") {
							// if (attribute.Name === "email") {
							// 	modifiedUserResponse.emailAddress = attribute.Value;
							// }
							// if (attribute.Name === "email_verified") {
							// 	modifiedUserResponse.emailVerified = attribute.Value;
							// }
							if (attribute.Name === "name") {
								modifiedUserResponse.firstName = attribute.Value;
							}
							if (attribute.Name === "family_name") {
								modifiedUserResponse.lastName = attribute.Value;
							}
						}
					});
					// send response
					lambdaResponse(200, callback, modifiedUserResponse); // returns empty obj
				}
			);
		}
	});
};

module.exports.deleteUser = (event, context, callback) => {
	const eventBodyJson = JSON.parse(event.body);
	const accessToken = eventBodyJson.accessToken;
	const params = {
		AccessToken: accessToken
	};
	cognitoIdentityServiceProvider.deleteUser(params, function(err, data) {
		if (err) {
			console.error(err, err.stack);
			lambdaResponse(400, callback, err);
		} else {
			// {}
			lambdaResponse(200, callback, {
				message: "User account deleted"
			});
		}
	});
};

module.exports.logOut = (event, context, callback) => {
	const params = {
		AccessToken: event.headers["x-custom-token"]
	};
	cognitoIdentityServiceProvider.globalSignOut(params, function(err, data) {
		if (err) {
			console.error(err, err.stack);
			lambdaResponse(400, callback, err);
		} else {
			// {}
			lambdaResponse(200, callback, {
				message: "Log out successful!"
			});
		}
	});
};
