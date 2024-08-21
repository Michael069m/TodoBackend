const User = require("../models/user");
const { google } = require("googleapis");

require("dotenv").config();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const scopes = JSON.parse(process.env.scopes);

const calendar = google.calendar({
  version: "v3",
  auth: process.env.apiKey,
});
// console.log(scopes)
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  process.env.redirectUrl
);

const handleRedirectUrl = (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
  });
  res.redirect(url);
};

const handleUserInfoAndToken = async (req, res) => {
  try {
    const code = req.query.code;
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    let user = await User.findOne({ email: payload.email });
    if (!user) {
      user = await User.create({
        name: payload.name,
        email: payload.email,
        events: [],
      });
    }
    const userCookie = {
      name: payload.name,
      email: payload.email,
      pic: payload.picture,
      token: tokens.access_token,
    };
    console.log(userCookie);
    res.cookie("userData", JSON.stringify(userCookie));

    res.redirect("http://localhost:3000");
  } catch (err) {
    console.error("Error during authentication:", err);
    res.status(500).send("Authentication failed");
  }
};

const handleLogOut = (req, res) => {
  if (oauth2Client.credentials.access_token) {
    oauth2Client.revokeCredentials((err) => {
      if (err) {
        console.error("Error revoking credentials:", err);
        return res.status(500).send("Failed to logout");
      }
      oauth2Client.setCredentials(null);
      console.log("logged out successfully");
      res.send("Logged out successfully");
    });
  } else {
    res.send("Already Logged out");
  }
};

const handleFetchGoogleEvents = async (req, res) => {
  try {
    const response = await calendar.events.list({
      calendarId: "primary",
      auth: oauth2Client,
      timeMin: new Date().toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items.map((event) => ({
      id: event.id,
      title: event.summary,
      start: new Date(event.start.dateTime || event.start.date),
      end: new Date(event.end.dateTime || event.end.date),
    }));

    res.json(events);
  } catch (err) {
    console.error("Error fetching Google Calendar events:", err);
    res.status(500).send("Failed to fetch events");
  }
};

module.exports = {
  handleRedirectUrl,
  handleUserInfoAndToken,
  handleLogOut,
  handleFetchGoogleEvents,
  oauth2Client,
};
