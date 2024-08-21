const { Router } = require("express");
const {
  handleRedirectUrl,
  handleUserInfoAndToken,
  handleLogOut,
  handleFetchGoogleEvents,
} = require("../controllers/auth");
const isSignIn = require("../middleware/auth");

const router = Router();

router.get("/google", handleRedirectUrl);

router.get("/google/redirect", handleUserInfoAndToken);

router.get("/google/logout", handleLogOut);

router.get("/google/calendar-events", isSignIn, handleFetchGoogleEvents);

module.exports = router;
