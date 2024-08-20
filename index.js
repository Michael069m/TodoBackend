const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const app = express();
require("dotenv").config();
const dayjs = require("dayjs");
const User = require("./models/user");
const { connectMongoDB } = require("./helpers/connection");

// Connect to MongoDB
connectMongoDB(
  "mongodb+srv://yatharth:123qaz123@cluster1.bthk3na.mongodb.net/prepdona"
).then(() => console.log("MongoDB connected successfully!!!!!"));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(
  cors({
    origin: "http://localhost:3000", // Your frontend's origin
    credentials: true, // Allow cookies to be sent
  })
);

// Initialize Google Calendar API with the provided API Key
const calendar = google.calendar({
  version: "v3",
  auth: "AIzaSyDCuH5XBveBgB45qdESi8YnrT3cgBInuxA", // Updated with your valid API key
});

// Use the provided Google Client ID and Client Secret
const GOOGLE_CLIENT_ID =
  "912276168470-rfufd4953c67dundn7vh0nbibrsdp7ch.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "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";

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  "http://localhost:8000/google/redirect" // The redirect URL for your app
);

const scopes = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
];

function isSignIn(req, res, next) {
  const { credentials } = oauth2Client;
  if (credentials && credentials.access_token) {
    next();
  } else {
    res.redirect("/");
  }
}

// Route to start the Google OAuth process
app.get("/google", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
  });
  res.redirect(url);
});

// Route to handle the OAuth redirect and fetch the tokens
app.get("/google/redirect", async (req, res) => {
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
    };
    console.log(userCookie);
    // Set a cookie with the payload
    res.cookie("userData", JSON.stringify(userCookie));

    // Redirect to the React app
    res.redirect("http://localhost:3000");
  } catch (err) {
    console.error("Error during authentication:", err);
    res.status(500).send("Authentication failed");
  }
});

// Route to schedule an event
app.post("/schedule-event", isSignIn, async (req, res) => {
  try {
    const { summary, description, start, end } = req.body;
    const email = req.query.email; // Get email from query parameters

    // Schedule an event in Google Calendar
    const event = await calendar.events.insert({
      calendarId: "primary",
      auth: oauth2Client,
      requestBody: {
        summary: summary,
        description: description,
        start: { dateTime: start, timeZone: "Asia/Kolkata" },
        end: { dateTime: end, timeZone: "Asia/Kolkata" },
      },
    });

    const eventId = event.data.id;

    // Update MongoDB with the new event
    await User.updateOne(
      { email: email },
      { $push: { events: { eventId, summary, description, start, end } } }
    );

    // Fetch updated user details
    const updatedUser = await User.findOne({ email: email });

    res.status(200).send({
      message: "Event scheduled successfully",
      eventId,
      user: updatedUser,
    });
  } catch (err) {
    console.error("Error scheduling event:", err);
    res.status(500).send("Failed to schedule event");
  }
});

// Route to fetch events
app.get("/events", isSignIn, async (req, res) => {
  try {
    const userEmail = req.query.email;
    if (!userEmail) {
      return res.status(400).send("Email is required");
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.status(404).send("User not found");
    }

    res.json(user.events); // Return the events directly
  } catch (err) {
    console.error("Error fetching events:", err);
    res.status(500).send("Failed to fetch events");
  }
});

// Route to update an event
app.put("/update-event", isSignIn, async (req, res) => {
  try {
    const { eventId, summary, description, start, end } = req.body;
    const { email } = req.query;
    console.log(eventId);
    console.log(summary);
    console.log(start);
    console.log(description);
    console.log(end);
    console.log(email);
    // Update the event in Google Calendar
    await calendar.events.update({
      calendarId: "primary",
      eventId: eventId,
      auth: oauth2Client,
      requestBody: {
        summary: summary,
        description: description,
        start: { dateTime: start, timeZone: "Asia/Kolkata" },
        end: { dateTime: end, timeZone: "Asia/Kolkata" },
      },
    });

    // Update the event in MongoDB
    await User.updateOne(
      { email: email, "events.eventId": eventId },
      {
        $set: {
          "events.$.summary": summary,
          "events.$.description": description,
          "events.$.start": start,
          "events.$.end": end,
        },
      }
    );

    res.status(200).send("Event updated successfully");
  } catch (err) {
    console.error("Error updating event:", err);
    res.status(500).send("Failed to update event");
  }
});

// Route to delete an event
// Route to delete an event
app.delete("/delete-event", isSignIn, async (req, res) => {
  try {
    const { eventId } = req.body;
    const { email } = req.query;

    // Check if the event exists in Google Calendar
    let eventExists = true;
    try {
      await calendar.events.get({
        calendarId: "primary",
        eventId: eventId,
        auth: oauth2Client,
      });
    } catch (error) {
      if (
        error.code === 404 ||
        (error.errors && error.errors[0].reason === "deleted")
      ) {
        eventExists = false; // Event does not exist or has already been deleted
        console.log(
          "Event not found in Google Calendar, proceeding with deletion from database."
        );
      } else {
        console.error("Error checking event in Google Calendar:", error);
        res.status(500).send({
          message: "Error checking event in Google Calendar",
          error: error.message,
        });
        return; // Exit the function early
      }
    }

    // Delete the event from Google Calendar if it exists
    if (eventExists) {
      try {
        await calendar.events.delete({
          calendarId: "primary",
          eventId: eventId,
          auth: oauth2Client,
        });
        console.log("Event deleted from Google Calendar.");
      } catch (error) {
        console.error("Error deleting event from Google Calendar:", error);
        res.status(500).send({
          message: "Error deleting event from Google Calendar",
          error: error.message,
        });
        return; // Exit the function early
      }
    }

    // Remove the event from MongoDB
    try {
      const result = await User.updateOne(
        { email: email },
        { $pull: { events: { eventId: eventId } } }
      );

      if (result.nModified === 0) {
        console.log("No event found to delete in MongoDB.");
        res.status(404).send("Event not found in the database");
        return; // Exit the function early
      }

      console.log("Event deleted from MongoDB.");
      res
        .status(200)
        .send(
          "Event deleted successfully from the database and, if present, from Google Calendar."
        );
    } catch (error) {
      console.error("Error deleting event from MongoDB:", error);
      res.status(500).send({
        message: "Error deleting event from MongoDB",
        error: error.message,
      });
    }
  } catch (err) {
    console.error("Error deleting event:", err);
    res
      .status(500)
      .send({ message: "Failed to delete event", error: err.message });
  }
});

// Route to handle logout
app.get("/logout", (req, res) => {
  oauth2Client.revokeCredentials((err) => {
    if (err) {
      console.error("Error revoking credentials:", err);
      return res.status(500).send("Failed to logout");
    }
    oauth2Client.setCredentials(null);
    console.log("logged out successfully");
    res.send("Logged out successfully");
  });
});

// Start the server
const PORT = 8000;
app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
