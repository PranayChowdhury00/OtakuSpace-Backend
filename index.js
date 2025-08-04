const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

const port = process.env.PORT || 5000;

//middleware
app.use(express.json());
app.use(cors(
    {
        origin: ['http://localhost:5173'], //replace with client address
        credentials: true,
    }
)); 

// cookie parser middleware
app.use(cookieParser());




//mongo db start



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.50gak.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    //mongodb database and collection
    const database = client.db("OtakuSpace");
    const userCollection = database.collection("users");
    const wishlistCollection = database.collection("wishList");
    const communityCollection = database.collection("communityPicks");
    const recommendCollection = database.collection("recommendations");
    const topicsCollection = database.collection("topics");
const commentsCollection = database.collection("comments");
const votesCollection = database.collection("votes");
    
//post users
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    //get users
    app.get("/users", async (req, res) => {
      const user = await userCollection.find().toArray();
      res.send(user);
    });

    // Add this to your server.js file, inside the run() function

// Get single user by UID
app.get("/users/:uid", async (req, res) => {
  const uid = req.params.uid;
  const query = { uid: uid };
  const user = await userCollection.findOne(query);
  
  if (user) {
    res.send(user);
  } else {
    res.status(404).send("User not found");
  }
});

// Update existing user endpoint (optional but recommended)
app.put("/users/:uid", async (req, res) => {
  const uid = req.params.uid;
  const user = req.body;
  const filter = { uid: uid };
  const options = { upsert: true }; // Creates new if doesn't exist
  
  const updateDoc = {
    $set: {
      name: user.name,
      email: user.email,
      photoURL: user.photoURL,
      updatedAt: new Date()
    }
  };
  
  const result = await userCollection.updateOne(filter, updateDoc, options);
  res.send(result);
});


// wish list anime

app.post("/wishList", async (req, res) => {
      try {
        const cartItem = req.body;
        const result = await wishlistCollection.insertOne(cartItem);
        res.send(result);
      } catch (error) {
        console.error("Error adding to cart:", error);
        res.status(500).send({ message: "Failed to add to cart" });
      }
    });

    app.get("/wishList", async (req, res) => {
      const result = await wishlistCollection.find().toArray();
      res.send(result);
    });

    app.get("/wishList/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { userEmail: email }; // Make sure this field matches
        const result = await wishlistCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error(error.message);
        res.status(500).send({ message: "Failed to get items from cart" });
      }
    });

    app.delete("/wishList/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        console.error(error.message);
        res.status(500).send({ message: "Failed to delete item from cart" });
      }
    });

    app.put("/wishList/:id", async (req, res) => {
  const { id } = req.params;
  const { watched } = req.body;
  const result = await wishlistCollection.updateOne({ _id: new ObjectId(id) }, { $set: { watched } });
  res.send(result);
});

//
app.get('/api/news', async (req, res) => {
  try {
    const response = await axios.get('https://www.animenewsnetwork.com/newsroom/rss.xml');
    const parser = new XMLParser();
    const jsonData = parser.parse(response.data);
    
    const news = jsonData.rss.channel.item.map((item, index) => {
      // Improved image extraction with fallback
      let imageUrl = extractImageFromDescription(item.description);
      
      // ANN often uses relative image paths, so we need to convert them
      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = `https://www.animenewsnetwork.com${imageUrl}`;
      }
      
      // Fallback ANN logo if no image found
      if (!imageUrl) {
        imageUrl = 'https://www.animenewsnetwork.com/images/ann.ico';
      }

      return {
        id: index,
        title: item.title,
        summary: cleanDescription(item.description),
        date: item.pubDate,
        source: "AnimeNewsNetwork",
        url: item.link,
        image: imageUrl
      };
    });

    res.json(news.slice(0, 8));
  } catch (error) {
    console.error('Error fetching news:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

//

// Update your vote endpoint to handle both initial votes and community votes
app.post("/vote", async (req, res) => {
  const { animeId, userEmail, title, image } = req.body;
  
  // Check if user already voted for this anime
  const existingVote = await communityCollection.findOne({ 
    animeId, 
    userEmail 
  });

  if (existingVote) {
    return res.status(400).json({ message: "You already voted for this anime" });
  }

  // Insert new vote
  const result = await communityCollection.insertOne({
    animeId,
    title,
    image,
    userEmail,
    createdAt: new Date()
  });

  res.status(201).json(result);
});

// Add this new endpoint to get aggregated vote counts
app.get("/top-voted", async (req, res) => {
  try {
    const topAnime = await communityCollection.aggregate([
      {
        $group: {
          _id: "$animeId",
          title: { $first: "$title" },
          image: { $first: "$image" },
          votes: { $sum: 1 }
        }
      },
      { $sort: { votes: -1 } },
      { $limit: 20 }
    ]).toArray();

    res.json(topAnime);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to get top voted anime" });
  }
});

// Watchlist endpoints
app.post("/watchList", async (req, res) => {
  try {
    const watchItem = req.body;
    const result = await database.collection("watchList").insertOne(watchItem);
    res.send(result);
  } catch (error) {
    console.error("Error adding to watchlist:", error);
    res.status(500).send({ message: "Failed to add to watchlist" });
  }
});


app.get("/watchList/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const query = { userEmail: email };
    const result = await database.collection("watchList").find(query).toArray();
    res.send(result);
  } catch (error) {
    console.error(error.message);
    res.status(500).send({ message: "Failed to get watchlist items" });
  }
});

app.delete("/watchList/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await database.collection("watchList").deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    console.error(error.message);
    res.status(500).send({ message: "Failed to delete item from watchlist" });
  }
});




function extractImageFromDescription(description) {
  // First try to find ANN's typical image format
  const annImageRegex = /<img [^>]*src=["'](\/images\/[^"']+)["']/i;
  const annMatch = description.match(annImageRegex);
  if (annMatch) return annMatch[1];
  
  // Fallback to generic image search
  const imgRegex = /<img[^>]+src=["']([^"'>]+)["']/i;
  const match = description.match(imgRegex);
  return match ? match[1] : null;
}

function cleanDescription(description) {
  // Remove all HTML tags and truncate
  return description.replace(/<[^>]+>/g, '').substring(0, 200) + '...';
}

function extractImageFromDescription(description) {
  const imgRegex = /<img[^>]+src="([^">]+)"/;
  const match = description.match(imgRegex);
  return match ? match[1] : null;
}

app.get('/recommendations', async(req,res)=>{
  const result = await recommendCollection.find().toArray();
  res.send(result)
})


app.post("/ai-recommend", async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).send({ message: "Query is required" });
  }

  try {
    // First try exact match (case insensitive)
    const exactMatch = await recommendCollection.findOne({
      query: { $regex: new RegExp(`^${query}$`, "i") }
    });

    if (exactMatch?.suggestions?.length > 0) {
      return res.send(exactMatch.suggestions);
    }

    // Then try partial match
    const partialMatch = await recommendCollection.findOne({
      query: { $regex: new RegExp(query, "i") }
    });

    if (partialMatch?.suggestions?.length > 0) {
      return res.send(partialMatch.suggestions);
    }

    // Then try to find by extracted keywords
    const keywords = query.split(/\s+/).filter(word => word.length > 3);
    if (keywords.length > 0) {
      const keywordMatch = await recommendCollection.findOne({
        query: { $in: keywords.map(k => new RegExp(k, "i")) }
      });

      if (keywordMatch?.suggestions?.length > 0) {
        return res.send(keywordMatch.suggestions);
      }
    }

    // If nothing found
    res.send([]);
  } catch (error) {
    console.error("AI Recommend Error:", error);
    res.status(500).send({ message: "Failed to fetch recommendations" });
  }
});



// Create new discussion topic
app.post('/api/topics', async (req, res) => {
  const { title, content, authorId, tags = [] } = req.body;

  const newTopic = {
    title,
    content: content || "",
    authorId,
    tags,
    upvotes: 0,
    downvotes: 0,
    commentsCount: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const result = await topicsCollection.insertOne(newTopic);
  res.status(201).json(result);
});

// Get all topics
app.get('/api/topics', async (req, res) => {
  const { sort = 'newest' } = req.query;

  let sortOption = { createdAt: -1 };
  if (sort === 'popular') sortOption = { upvotes: -1 };
  if (sort === 'controversial') sortOption = { commentsCount: -1 };

  const topics = await topicsCollection.find().sort(sortOption).toArray();
  res.json(topics);
});

// Get single topic with comments
app.get('/api/topics/:id', async (req, res) => {
  const topicId = new ObjectId(req.params.id);

  const topic = await topicsCollection.findOne({ _id: topicId });
  if (!topic) return res.status(404).send({ message: "Topic not found" });

  const comments = await commentsCollection.find({ topicId: req.params.id }).sort({ createdAt: 1 }).toArray();

  res.json({ ...topic, comments });
});

// Vote on a topic
app.post('/api/topics/:id/vote', async (req, res) => {
  const topicId = req.params.id;
  const { userId, direction } = req.body;

  // Remove existing vote
  await votesCollection.deleteMany({ userId, topicId });

  // Add new vote if direction is provided
  if (direction === "up" || direction === "down") {
    await votesCollection.insertOne({
      userId,
      topicId,
      direction,
      createdAt: new Date()
    });
  }

  // Recalculate votes
  const upvotes = await votesCollection.countDocuments({ topicId, direction: "up" });
  const downvotes = await votesCollection.countDocuments({ topicId, direction: "down" });

  await topicsCollection.updateOne(
    { _id: new ObjectId(topicId) },
    { $set: { upvotes, downvotes } }
  );

  res.json({ upvotes, downvotes });
});

// Add comment to a topic
app.post('/api/topics/:id/comments', async (req, res) => {
  const topicId = req.params.id;
  const { content, authorId } = req.body;

  const newComment = {
    topicId,
    content,
    authorId,
    upvotes: 0,
    downvotes: 0,
    createdAt: new Date()
  };

  const result = await commentsCollection.insertOne(newComment);

  // Update comment count in topic
  await topicsCollection.updateOne(
    { _id: new ObjectId(topicId) },
    { $inc: { commentsCount: 1 } }
  );

  res.status(201).json(result);
});

// Vote on a comment
app.post('/api/comments/:id/vote', async (req, res) => {
  const commentId = req.params.id;
  const { userId, direction } = req.body;

  // Remove existing vote
  await votesCollection.deleteMany({ userId, commentId });

  // Add new vote if direction exists
  if (direction === "up" || direction === "down") {
    await votesCollection.insertOne({
      userId,
      commentId,
      direction,
      createdAt: new Date()
    });
  }

  const upvotes = await votesCollection.countDocuments({ commentId, direction: "up" });
  const downvotes = await votesCollection.countDocuments({ commentId, direction: "down" });

  await commentsCollection.updateOne(
    { _id: new ObjectId(commentId) },
    { $set: { upvotes, downvotes } }
  );

  res.json({ upvotes, downvotes });
});





    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




//mongo db end

app.get('/', (req, res) => {
    res.send('Hello from my server')
})

app.listen(port, () => {
    console.log('My simple server is running at', port);
})
