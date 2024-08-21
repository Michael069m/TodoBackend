const { oauth2, oauth2_v2 } = require("googleapis/build/src/apis/oauth2");
const User = require("../models/user");
const { google } = require("googleapis");
const { oauth2Client } = require("./auth");

require("dotenv").config();

const calendar = google.calendar({
  version: "v3",
  auth: process.env.apiKey,
});

const handleScheduleEvents = async (req, res) => {
  try {
    const { summary, description, start, end, priority, isSync } = req.body;
    const email = req.query.email;
    let eventId = 0;
    if (isSync) {
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
      eventId = event.data.id;
    }
    const [seconds, nanoseconds] = process.hrtime();
    const totalNanoseconds = seconds * 1e9 + nanoseconds;
    if (eventId === 0) {
      eventId = totalNanoseconds;
    }

    await User.updateOne(
      { email: email },
      {
        $push: {
          events: {
            eventId,
            summary,
            description,
            start,
            end,
            priority,
            isSync,
            isComplete: false,
          },
        },
      }
    );

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
};

const handleFetchEvents = async (req, res) => {
  try {
    const userEmail = req.query.email;
    if (!userEmail) {
      return res.status(400).send("Email is required");
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.status(404).send("User not found");
    }

    res.json(user.events);
  } catch (err) {
    console.error("Error fetching events:", err);
    res.status(500).send("Failed to fetch events");
  }
};

const handleDateChange = async (req, res) => {
  try {
    const { eventId, start, end, summary, description, priority } = req.body;
    const { email } = req.query;

    // Update event in Google Calendar
    try {
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

      console.log("Event updated in Google Calendar.");
    } catch (err) {
      console.error("Error updating event in Google Calendar:", err);
      return res.status(500).send("Failed to update event in Google Calendar");
    }

    // Update event in MongoDB
    try {
      await User.updateOne(
        { email: email, "events.eventId": eventId },
        {
          $set: {
            "events.$.summary": summary,
            "events.$.description": description,
            "events.$.start": start,
            "events.$.end": end,
            "events.$.priority": priority,
          },
        }
      );
      console.log("Event updated successfully in MongoDB.");
      res.status(200).send("Event updated successfully");
    } catch (err) {
      console.error("Error updating event in MongoDB:", err);
      return res.status(500).send("Failed to update event in MongoDB");
    }
  } catch (err) {
    console.error("Unexpected error during event update:", err);
    res.status(500).send("Failed to update event");
  }
};

const handleUpdateEvents = async (req, res) => {
  try {
    const { eventId, summary, description, start, end, priority, isSync } =
      req.body;
    const { email } = req.query;

    if (!eventId) {
      return res.status(400).send("Event ID is required");
    }

    console.log("Starting update for eventId:", eventId);
    let eventExists = true;
    if (isSync) {
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
          eventExists = false;
          console.log(
            "Event not found in Google Calendar, proceeding with deletion from database."
          );
        } else {
          console.error("Error checking event in Google Calendar:", error);
          res.status(500).send({
            message: "Error checking event in Google Calendar",
            error: error.message,
          });
          return;
        }
      }
      if (eventExists) {
        try {
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
          console.log("Event updated successfully in Google Calendar.");
        } catch (err) {
          console.error("Error updating event in Google Calendar:", err);
          return res
            .status(500)
            .send("Failed to update event in Google Calendar");
        }
        try {
          await User.updateOne(
            { email: email, "events.eventId": eventId },
            {
              $set: {
                "events.$.summary": summary,
                "events.$.description": description,
                "events.$.start": start,
                "events.$.end": end,
                "events.$.priority": priority,
                "events.$.isSync": isSync,
              },
            }
          );
          console.log("Event updated successfully in MongoDB.");
        } catch (err) {
          console.error("Error updating event in MongoDB:", err);
          return res.status(500).send("Failed to update event in MongoDB");
        }
      } else {
        try {
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
          const eventId1 = event.data.id;
          try {
            await User.updateOne(
              { email: email, "events.eventId": eventId },
              {
                $set: {
                  "events.$.summary": summary,
                  "events.$.description": description,
                  "events.$.start": start,
                  "events.$.end": end,
                  "events.$.priority": priority,
                  "events.$.eventId": eventId1,
                  "events.$.isSync": isSync,
                },
              }
            );
            console.log("Event updated successfully in MongoDB.");
          } catch (err) {
            console.error("Error updating event in MongoDB:", err);
            return res.status(500).send("Failed to update event in MongoDB");
          }
        } catch (err) {
          console.log(err);
        }
      }
    } else {
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
          eventExists = false;
          console.log(
            "Event not found in Google Calendar, proceeding with deletion from database."
          );
        } else {
          console.error("Error checking event in Google Calendar:", error);
          res.status(500).send({
            message: "Error checking event in Google Calendar",
            error: error.message,
          });
          return;
        }
      }
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
          return;
        }
        try {
          await User.updateOne(
            { email: email, "events.eventId": eventId },
            {
              $set: {
                "events.$.summary": summary,
                "events.$.description": description,
                "events.$.start": start,
                "events.$.end": end,
                "events.$.priority": priority,
                "events.$.isSync": isSync,
              },
            }
          );
          console.log("Event updated successfully in MongoDB.");
        } catch (err) {
          console.error("Error updating event in MongoDB:", err);
          return res.status(500).send("Failed to update event in MongoDB");
        }
      } else {
        try {
          await User.updateOne(
            { email: email, "events.eventId": eventId },
            {
              $set: {
                "events.$.summary": summary,
                "events.$.description": description,
                "events.$.start": start,
                "events.$.end": end,
                "events.$.priority": priority,
                "events.$.isSync": isSync,
              },
            }
          );
          console.log("Event updated successfully in MongoDB.");
        } catch (err) {
          console.error("Error updating event in MongoDB:", err);
          return res.status(500).send("Failed to update event in MongoDB");
        }
      }
    }

    res.status(200).send("Event updated successfully");
  } catch (err) {
    console.error("Unexpected error during event update:", err);
    res.status(500).send("Failed to update event");
  }
};

const handleCompleteEvent = async (req, res) => {
  try {
    const { eventId, isComplete } = req.body;
    const { email } = req.query;

    if (!eventId) {
      return res.status(400).send("Event ID is required");
    }

    console.log("Starting update for eventId:", eventId);

    try {
      await User.updateOne(
        { email: email, "events.eventId": eventId },
        {
          $set: {
            "events.$.isComplete": isComplete,
          },
        }
      );
      console.log("Event updated successfully in MongoDB.");
    } catch (err) {
      console.error("Error updating event in MongoDB:", err);
      return res.status(500).send("Failed to update event in MongoDB");
    }

    res.status(200).send("Event updated successfully");
  } catch (err) {
    console.error("Unexpected error during event update:", err);
    res.status(500).send("Failed to update event");
  }
};

const handleDeleteEvent = async (req, res) => {
  try {
    const { eventId, isSync } = req.body;
    const { email } = req.query;

    let eventExists = true;
    if (isSync) {
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
          eventExists = false;
          console.log(
            "Event not found in Google Calendar, proceeding with deletion from database."
          );
        } else {
          console.error("Error checking event in Google Calendar:", error);
          res.status(500).send({
            message: "Error checking event in Google Calendar",
            error: error.message,
          });
          return;
        }
      }

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
          return;
        }
      }
    }

    try {
      const result = await User.updateOne(
        { email: email },
        { $pull: { events: { eventId: eventId } } }
      );

      if (result.nModified === 0) {
        console.log("No event found to delete in MongoDB.");
        res.status(404).send("Event not found in the database");
        return;
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
};
module.exports = {
  handleScheduleEvents,
  handleFetchEvents,
  handleUpdateEvents,
  handleCompleteEvent,
  handleDeleteEvent,
  handleDateChange,
};
