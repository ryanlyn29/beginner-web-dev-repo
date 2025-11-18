// watch-redis.js - Real-time Redis monitoring
import redis from './redis.js';

let previousUserCount = 0;
let knownUsers = new Set();

async function checkRedisUpdates() {
  try {
    // Get all user keys
    const userKeys = await redis.keys('user:*');
    const currentUserCount = userKeys.length;

    // Check if user count changed
    if (currentUserCount !== previousUserCount) {
      console.log(`\n🔄 User count changed: ${previousUserCount} → ${currentUserCount}`);
      previousUserCount = currentUserCount;
    }

    // Check for new users
    for (const key of userKeys) {
      if (!knownUsers.has(key)) {
        const userData = await redis.hGetAll(key);
        console.log(`\n✨ NEW USER DETECTED!`);
        console.log(`   📧 Email: ${userData.email}`);
        console.log(`   👤 Name: ${userData.name}`);
        console.log(`   🆔 ID: ${userData.id}`);
        console.log(`   📅 Created: ${userData.created_at || 'N/A'}`);
        knownUsers.add(key);
      }
    }
  } catch (error) {
    console.error('Error monitoring Redis:', error.message);
  }
}

async function startMonitoring() {
  try {
    await redis.connect();
    console.log('🔍 Monitoring Redis database for changes...');
    console.log('Press Ctrl+C to stop\n');

    // Initialize known users
    const userKeys = await redis.keys('user:*');
    previousUserCount = userKeys.length;
    knownUsers = new Set(userKeys);
    console.log(`📊 Currently tracking ${previousUserCount} user(s)\n`);

    // Poll every 2 seconds
    setInterval(checkRedisUpdates, 2000);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log('\n\n👋 Stopping monitoring...');
  await redis.quit();
  process.exit(0);
});

startMonitoring();
