const express = require('express');
const proxy = require('express-http-proxy');
const moment = require('moment');

const port = 3000;
const baseUrl = "https://v1.nocodeapi.com/";

const app = express();

const cacheDuration = 1 //hours
const cache = {};

app.use('/api/', proxy(baseUrl, {
  filter: function (req, res) {    
    if (cache[req.url] === undefined){
      console.log(`First call to ${req.url} [proxy]`);
      return true;
    }
    
    const cached = cache[req.url];
    const diffInHours = moment().diff(cached.timestamp, "hours");

    if (diffInHours >= cacheDuration){
      console.log(`${cacheDuration} hours passed [proxy]`);
      return true;
    }
    
    console.log(`Cached ${diffInHours} hours ago [cache]`);
    res.send(cached.content);
    return false;
  },
  userResDecorator: function(proxyRes, proxyResData, userReq, userRes) {
    cache[userReq.url] = {
      content: JSON.parse(proxyResData.toString('utf8')),
      timestamp: moment()
    };

    return cache[userReq.url].content;
  }
}));

app.get('/', (req, res) => {
  res.send('Go away!')
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
});
