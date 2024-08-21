const { oauth2Client } = require("../controllers/auth");

const isSignIn = (req, res, next) => {
  const { credentials } = oauth2Client;
  if (credentials && credentials.access_token) {
    next();
  } else {
    res.redirect("/");
  }
};
module.exports = isSignIn;
