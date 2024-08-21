const { Router } = require("express");
const isSignIn = require("../middleware/auth");
const {
  handleScheduleEvents,
  handleFetchEvents,
  handleUpdateEvents,
  handleCompleteEvent,
  handleDeleteEvent,
  handleDateChange,
} = require("../controllers/calendar");

const router = Router();

router.post("/schedule-event", isSignIn, handleScheduleEvents);

router.get("/events", isSignIn, handleFetchEvents);

router.put("/update-event", isSignIn, handleUpdateEvents);

router.put("/complete-event", isSignIn, handleCompleteEvent);

router.delete("/delete-event", isSignIn, handleDeleteEvent);

router.put("/change-date", isSignIn, handleDateChange);

module.exports = router;
