require('dotenv').config()
const express = require('express');
const proxy = require('express-http-proxy');
const moment = require('moment');
const MongoClient = require('mongodb').MongoClient;

const port = process.env.PORT;
const baseUrl = process.env.PROXY_TARGET;
const cacheDuration = process.env.CACHE_DURATION_HOURS;
const mongoUrl = process.env.MONGO_URL;
const mongoDb = process.env.DATABASE;
const collectionName = "cache";
const app = express();

const client = new MongoClient(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });

function connectToDatabase() {
  return new Promise((res, rej) => {
    client.connect(async err => {
      if (err) {
        console.log("Connection error");
        return rej(err);
      }

      const collection = client.db(mongoDb).collection(collectionName);
      console.log("Connected to db");
      return res(collection);
    });
  })
}


app.get('/', (req, res) => {
  res.send('Go away!')
});

async function main() {
  const collection = await connectToDatabase();

  app.use('/api/', proxy(baseUrl, {
    filter: async function (req, res) {
      const cached = await collection.findOne({ url: req.url });

      if (cached === null) {
        console.log(`First call to ${req.url} [proxy]`);
        return true;
      }

      const timestamp = moment(cached.timestamp)
      const diffInHours = moment().diff(timestamp, "hours");

      if (diffInHours >= cacheDuration) {
        console.log(`${cacheDuration} hours passed [proxy]`);
        return true;
      }

      console.log(`Cached ${diffInHours} hours ago [cache]`);
      res.send(cached.response);
      return false;
    },
    userResDecorator: async function (proxyRes, proxyResData, userReq, userRes) {
      let body;
      try {
        body = JSON.parse(proxyResData.toString('utf8'));

        console.log("Try to update cache with url", userReq.url);
        await collection.updateOne({ url: userReq.url }, {
          $set: {
            timestamp: new Date(),
            response: JSON.stringify(body)
          }
        }, {
          upsert: true
        });
        console.log("Updated cache");
      } catch (err) {
        body = { error: err.toString() };
      }

      return body;
    }
  }));


  const closeDbClient = (code) => client.close();
  process.on('exit', closeDbClient);
  process.on('SIGINT', closeDbClient);
  process.on('SIGTERM', closeDbClient);

  app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
  });
}

main();
