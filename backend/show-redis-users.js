// show-redis-users.js - View all users in Redis
import redis from './redis.js';

async function showAllUsers() {
  try {
    await redis.connect();
    console.log('\n=== 🔍 REDIS DATABASE USERS ===\n');

    // Get all user keys
    const userKeys = await redis.keys('user:*');

    if (userKeys.length === 0) {
      console.log('❌ No users found in database\n');
      await redis.quit();
      return;
    }

    console.log(`Found ${userKeys.length} user(s):\n`);

    // Display each user
    for (const key of userKeys) {
      const userData = await redis.hGetAll(key);
      console.log(`📧 ${userData.email}`);
      console.log(`   ID: ${userData.id}`);
      console.log(`   Name: ${userData.name}`);
      console.log(`   Created: ${userData.created_at || 'N/A'}`);
      console.log('');
    }

    // Show email mappings
    console.log('\n=== 📬 EMAIL MAPPINGS ===\n');
    const emailKeys = await redis.keys('email:*');
    for (const key of emailKeys) {
      const userId = await redis.get(key);
      const email = key.replace('email:', '');
      console.log(`${email} → ${userId}`);
    }

    await redis.quit();
    console.log('\n✅ Done!\n');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

showAllUsers();
