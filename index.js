const express = require("express");
const cors = require("cors");
const app = express();
const { connectMongoDB } = require("./helpers/connection");
const authRouter = require("./routes/auth");
const calendarRouter = require("./routes/calendar");

require("dotenv").config();

connectMongoDB(process.env.mongoDbUrl).then(() =>
  console.log("MongoDB connected successfully!!!!!")
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(
  cors({
    origin: process.env.origin,
    credentials: true,
  })
);

app.use("/auth", authRouter);
app.use("/calendar", calendarRouter);

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
