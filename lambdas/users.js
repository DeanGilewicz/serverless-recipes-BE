"use strict";

global.fetch = require("node-fetch");
global.navigator = () => null;

const AWS = require("aws-sdk");
const AmplifyCore = require("aws-amplify");
const jwt = require("jsonwebtoken");
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
	"Access-Control-Allow-Origin": "*",
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

// const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider({ apiVersion: '2016-04-18' });
// const cognitoIdentity = new AWS.CognitoIdentity({ apiVersion: '2014-06-30' });
// const documentClient = new AWS.DynamoDB.DocumentClient();

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
		// console.log("PARAMS", params);
		cognitoIdentityServiceProvider.initiateAuth(params, function(err, data) {
			if (err) {
				// refresh token invalid - need to reauthenticate
				console.log(err);
				// console.log("ERROR HERE OH NO");
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
		username: eventBodyJson.emailAddress,
		password: eventBodyJson.password,
		attributes: {
			// aws default attributes
			// address
			// birthdate
			email: eventBodyJson.emailAddress, // required
			family_name: eventBodyJson.lastName, // required
			// gender
			// given_name
			// locale
			// middle_name
			name: eventBodyJson.firstName, // required
			// nickname
			// phone_number
			picture: eventBodyJson.picture
			// preferred_username
			// profile
			// timezone
			// updated_at
			// website
			// other custom attributes
		}
		//validationData: []  //optional
	})
		.then(data => {
			// console.log(data);
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
			// console.log(data);
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
			// console.log(data);
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
			// console.log(data); // nothing useful in response
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
	const password = eventBodyJson.password;
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
				console.log(err, err.stack);
				lambdaResponse(404, callback, err.message);
			} else if (err.code === "UserNotFoundException") {
				console.log(err, err.stack);
				lambdaResponse(404, callback, err.message);
			} else {
				console.log(err, err.stack);
				lambdaResponse(400, callback, err.message);
			}
		} else {
			//console.log(data); // nothing useful in response
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
			/*
			if( user.challengeName === "SMS_MFA" || user.challengeName === "SOFTWARE_TOKEN_MFA" ) {
				// Get the code from the UI inputs and then trigger the following function with a button click
				const code = getCodeFromUserInput();
				// If MFA is enabled, sign-in should be confirmed with the confirmation code
				AmplifyAuth.confirmSignIn(
					user,   // Return object from Auth.signIn()
					code,   // Confirmation code
					mfaType // MFA Type e.g. SMS_MFA, SOFTWARE_TOKEN_MFA
				)
				.then(data => {
					// console.log(data);
					lambdaResponse(200, callback, data);
				});
			} else if( user.challengeName === "NEW_PASSWORD_REQUIRED" ) {
				const {requiredAttributes} = user.challengeParam; // the array of required attributes, e.g ['email', 'phone_number']
				// Get the new password and required attributes from the UI inputs and then trigger the following function with a button click
				// For example, the email and phone_number are required attributes
				const {username, email, phone_number} = getInfoFromUserInput();
				AmplifyAuth.completeNewPassword(
					user,					// the Cognito User Object
					newPassword,	// the new password
					// OPTIONAL, the required attributes
					{
						email,
						phone_number,
					}
				)
				.then(data => {
					// console.log(data);
					lambdaResponse(200, callback, data);
				});
			} else if( user.challengeName === "MFA_SETUP" ) {
				// This happens when the MFA method is TOTP
				// The user needs to setup the TOTP before using it
				// More info please check the Enabling MFA part
				AmplifyAuth.setupTOTP(user)
				.then(data => {
					// console.log(data);
					lambdaResponse(200, callback, data);
				});
			} else {
			*/
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
			// const COOKIE_HEADERS = {
			// 	"content-type": "application/json",
			// 	// "Access-Control-Allow-Headers":
			// 	// "Content-Type,X-Amz-Date,Authorization,X-Api-Key,x-requested-with",
			// 	// "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
			// 	"Access-Control-Allow-Origin": "*", // Required for CORS support to work
			// 	"Access-Control-Allow-Credentials": true,
			// 	"Set-Cookie":
			// 		"thinkCookie=recipes1;Path=/;SameSite=None;Domain=.app.localhost" // Required for cookies, authorization headers with HTTPS
			// };
			// callback(null, {
			// 	statusCode: 200,
			// 	headers: COOKIE_HEADERS,
			// 	body: JSON.stringify(response)
			// });
			/*
			}
			*/
		})
		.catch(err => {
			if (err.code === "UserNotConfirmedException") {
				// The error happens if the user didn't finish the confirmation step when signing up
				// In this case you need to resend the code and confirm the user
				console.error(err);
				AmplifyAuth.resendSignUp(username)
					.then(() => {
						// console.log(data);
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
						// console.log(data);
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
	const currentPassword = eventBodyJson.currentPassword;
	const newPassword = eventBodyJson.newPassword;
	const accessToken = eventBodyJson.accessToken;

	// console.log('currentPassword', currentPassword);
	// console.log('newPassword', newPassword);
	// console.log('cognitoUser', cognitoUser);
	// AmplifyAuth.currentAuthenticatedUser()
	//   .then(user => {
	// 			// console.log('USER', user);
	// 			// return user;
	//       return AmplifyAuth.changePassword(cognitoUser, currentPassword, newPassword);
	//   })
	// // AmplifyAuth.changePassword(cognitoUser, currentPassword, newPassword)
	//   .then(data => {
	// 		console.log(data);
	// 		lambdaResponse(200, callback, {thing: 'ok'});
	// 	})
	//   .catch(err => {
	// 		console.error(err);
	// 		lambdaResponse(400, callback, err);
	// 	});

	const params = {
		AccessToken: accessToken,
		PreviousPassword: currentPassword,
		ProposedPassword: newPassword
	};
	cognitoIdentityServiceProvider.changePassword(params, function(err, data) {
		if (err) {
			console.log(err, err.stack);
			lambdaResponse(400, callback, err);
		} else {
			// console.log(data); // {}
			lambdaResponse(200, callback, {
				message: "Password Change Success"
			});
		}
	});
};

module.exports.updateUser = (event, context, callback) => {
	const eventBodyJson = JSON.parse(event.body);
	const userAttributes = [...eventBodyJson.userAttributes];
	const accessToken = eventBodyJson.accessToken;

	var params = {
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
				console.log(err, err.stack);
				lambdaResponse(400, callback, err.message);
			} else {
				console.log(err, err.stack);
				lambdaResponse(400, callback, err);
			}
		} else {
			// console.log(data); // {}
			lambdaResponse(200, callback, data);
		}
	});
};

module.exports.deleteUser = (event, context, callback) => {
	const eventBodyJson = JSON.parse(event.body);
	const accessToken = eventBodyJson.accessToken;

	var params = {
		AccessToken: accessToken
	};

	cognitoIdentityServiceProvider.deleteUser(params, function(err, data) {
		if (err) {
			console.log(err, err.stack);
			lambdaResponse(400, callback, err);
		} else {
			// console.log(data); // {}
			lambdaResponse(200, callback, {
				message: "User account deleted"
			});
		}
	});
};

module.exports.logOut = (event, context, callback) => {
	// AmplifyAuth.signOut({ global: true })
	//   .then(data => {
	// 		console.log('LOGOUT SUCCESS', data);
	// 		lambdaResponse(200, callback, data);
	// 	})
	//   .catch(err => {
	// 		console.error('LOGOUT ERROR', err);
	// 		lambdaResponse(404, callback, err);
	// 	});
	const params = {
		AccessToken: event.headers.Authorization
	};
	cognitoIdentityServiceProvider.globalSignOut(params, function(err, data) {
		if (err) {
			console.log(err, err.stack);
			lambdaResponse(400, callback, err);
		} else {
			// console.log(data); // {}
			lambdaResponse(200, callback, {
				message: "Log out successful!"
			});
		}
	});
};
