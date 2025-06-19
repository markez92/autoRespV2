const clientID = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground' // URI de redirección, no se usa en realidad
);

oauth2Client.setCredentials({ refresh_token: refreshToken });

module.exports.getAccessToken = async function() {
    try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        return credentials.access_token;
    } catch (error) {
        console.error('Error al obtener el access token:', error);
        throw error;
    }
}
  