const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI
mongoose
	.connect(MONGODB_URI)
	.then(() => console.log('MongoDB connected successfully'))
	.catch((err) => console.log('Error connecting', err))
