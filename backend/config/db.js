const mongoose = require('mongoose');
const dns = require('dns');

// Use Google DNS to fix SRV lookup failures on restricted networks
dns.setServers(['8.8.8.8', '8.8.4.4']);

const connectDB = async () => {
  const conn = await mongoose.connect(process.env.MONGODB_URI, {
    family: 4, // Force IPv4
  });
  console.log(`MongoDB Connected: ${conn.connection.host}`);
  return conn;
};

module.exports = connectDB;
