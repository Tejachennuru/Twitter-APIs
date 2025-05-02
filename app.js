const express = require('express')
const app = express()
const {open} = require('sqlite')
const path = require('path')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null

// Initialize DB and Server
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

// Authentication Middleware
const authenticateToken = (request, response, next) => {
  const authHeader = request.headers['authorization']
  let jwtToken
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401).send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'vbsvksbvsbvbv', async (error, payload) => {
      if (error) {
        response.status(401).send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

// Register API
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body

  const selectUserQuery = `SELECT * FROM user WHERE username = ?`
  const dbUser = await db.get(selectUserQuery, [username])

  if (dbUser !== undefined) {
    response.status(400).send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400).send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)

      const createUserQuery = `
        INSERT INTO user (username, password, name, gender)
        VALUES (?, ?, ?, ?)
      `
      await db.run(createUserQuery, [username, hashedPassword, name, gender])
      response.status(200).send('User created successfully')
    }
  }
})

// Login API
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const loginQuery = `SELECT * FROM user WHERE username = ?`
  const dbUser = await db.get(loginQuery, [username])

  if (dbUser === undefined) {
    response.status(400).send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'vbsvksbvsbvbv')
      response.send({jwtToken})
    } else {
      response.status(400).send('Invalid password')
    }
  }
})

// Protected Route - User Feed
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request

  try {
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = ?`
    const user = await db.get(getUserIdQuery, [username])

    if (!user) {
      return response.status(400).send('User not found')
    }

    const getTweetFeedQuery = `
      SELECT user.username, tweet.tweet, tweet.date_time AS dateTime
      FROM follower
      JOIN tweet ON follower.following_user_id = tweet.user_id
      JOIN user ON tweet.user_id = user.user_id
      WHERE follower.follower_user_id = ?
      ORDER BY tweet.date_time DESC
      LIMIT 4;
    `

    const dbFeed = await db.all(getTweetFeedQuery, [user.user_id])
    response.send(dbFeed)
  } catch (error) {
    response.status(500).send({error: error.message})
  }
})

// Following API
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request

  try {
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = ?`
    const user = await db.get(getUserIdQuery, [username])

    if (!user) {
      return response.status(400).send('User not found')
    }

    const getFollowingQuery = `
      SELECT user.name
      FROM follower
      JOIN user ON follower.following_user_id = user.user_id
      WHERE follower.follower_user_id = ?;
    `

    const dbFollowing = await db.all(getFollowingQuery, [user.user_id])
    response.send(dbFollowing)
  } catch (error) {
    response.status(500).send({error: error.message})
  }
})

// Followers API
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request

  try {
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = ?`
    const user = await db.get(getUserIdQuery, [username])

    if (!user) {
      return response.status(400).send('User not found')
    }

    const getFollowerQuery = `
      SELECT user.name
      FROM follower
      JOIN user ON follower.follower_user_id = user.user_id
      WHERE follower.following_user_id = ?;
    `

    const dbFollower = await db.all(getFollowerQuery, [user.user_id])
    response.send(dbFollower)
  } catch (error) {
    response.status(500).send({error: error.message})
  }
})

// Get User Tweets API
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request

  try {
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = ?`
    const user = await db.get(getUserIdQuery, [username])

    if (!user) {
      return response.status(400).send('User not found')
    }

    const getTweetsQuery = `
      SELECT tweet.tweet,
             COUNT(DISTINCT like.like_id) AS likes,
             COUNT(DISTINCT reply.reply_id) AS replies,
             tweet.date_time AS dateTime
      FROM tweet
      LEFT JOIN like ON tweet.tweet_id = like.tweet_id
      LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
      WHERE tweet.user_id = ?
      GROUP BY tweet.tweet_id;
    `

    const dbTweets = await db.all(getTweetsQuery, [user.user_id])
    response.send(dbTweets)
  } catch (error) {
    response.status(500).send({error: error.message})
  }
})

// Get Tweet by ID API
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {username} = request
  const {tweetId} = request.params

  try {
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = ?`
    const user = await db.get(getUserIdQuery, [username])

    if (!user) {
      return response.status(400).send('User not found')
    }

    const getTweetQuery = `
      SELECT tweet.tweet,
             COUNT(DISTINCT like.like_id) AS likes,
             COUNT(DISTINCT reply.reply_id) AS replies,
             tweet.date_time AS dateTime
      FROM tweet
      LEFT JOIN like ON tweet.tweet_id = like.tweet_id
      LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
      WHERE tweet.tweet_id = ? AND tweet.user_id IN (
        SELECT following_user_id FROM follower WHERE follower_user_id = ?
      )
      GROUP BY tweet.tweet_id;
    `

    const dbTweet = await db.get(getTweetQuery, [tweetId, user.user_id])

    if (!dbTweet) {
      return response.status(401).send('Invalid Request')
    }

    response.send(dbTweet)
  } catch (error) {
    response.status(500).send({error: error.message})
  }
})

// Get Likes of a Tweet by ID API
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params

    try {
      const getUserIdQuery = `SELECT user_id FROM user WHERE username = ?`
      const user = await db.get(getUserIdQuery, [username])

      if (!user) {
        return response.status(400).send('User not found')
      }

      const getLikesQuery = `
      SELECT user.username
      FROM like
      JOIN user ON like.user_id = user.user_id
      WHERE like.tweet_id = ? AND like.tweet_id IN (
        SELECT tweet.tweet_id FROM tweet
        JOIN follower ON tweet.user_id = follower.following_user_id
        WHERE follower.follower_user_id = ?
      );
    `

      const dbLikes = await db.all(getLikesQuery, [tweetId, user.user_id])

      if (dbLikes.length === 0) {
        return response.status(401).send('Invalid Request')
      }

      const likes = dbLikes.map(like => like.username)
      response.send({likes})
    } catch (error) {
      response.status(500).send({error: error.message})
    }
  },
)

// Get Replies of a Tweet by ID API
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params

    try {
      const getUserIdQuery = `SELECT user_id FROM user WHERE username = ?`
      const user = await db.get(getUserIdQuery, [username])

      if (!user) {
        return response.status(400).send('User not found')
      }

      const getRepliesQuery = `
      SELECT user.name, reply.reply
      FROM reply
      JOIN user ON reply.user_id = user.user_id
      WHERE reply.tweet_id = ? AND reply.tweet_id IN (
        SELECT tweet.tweet_id FROM tweet
        JOIN follower ON tweet.user_id = follower.following_user_id
        WHERE follower.follower_user_id = ?
      );
    `

      const dbReplies = await db.all(getRepliesQuery, [tweetId, user.user_id])

      if (dbReplies.length === 0) {
        return response.status(401).send('Invalid Request')
      }

      response.send({replies: dbReplies})
    } catch (error) {
      response.status(500).send({error: error.message})
    }
  },
)

// Post a New Tweet API
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const {tweet} = request.body

  try {
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = ?`
    const user = await db.get(getUserIdQuery, [username])

    if (!user) {
      return response.status(400).send('User not found')
    }

    const createTweetQuery = `
      INSERT INTO tweet (tweet, user_id)
      VALUES (?, ?);
    `

    await db.run(createTweetQuery, [tweet, user.user_id])
    response.send('Created a Tweet')
  } catch (error) {
    response.status(500).send({error: error.message})
  }
})

// Delete a Tweet by ID API
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params

    try {
      const getUserIdQuery = `SELECT user_id FROM user WHERE username = ?`
      const user = await db.get(getUserIdQuery, [username])

      if (!user) {
        return response.status(400).send('User not found')
      }

      const getTweetQuery = `
      SELECT * FROM tweet
      WHERE tweet_id = ? AND user_id = ?;
    `

      const tweet = await db.get(getTweetQuery, [tweetId, user.user_id])

      if (!tweet) {
        return response.status(401).send('Invalid Request')
      }

      const deleteTweetQuery = `
      DELETE FROM tweet
      WHERE tweet_id = ?;
    `

      await db.run(deleteTweetQuery, [tweetId])
      response.send('Tweet Removed')
    } catch (error) {
      response.status(500).send({error: error.message})
    }
  },
)

module.exports = app
