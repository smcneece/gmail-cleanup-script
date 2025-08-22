// Gmail Smart Storage Manager
// Version: 2025.8.2
// Author: Shawn McNeece (@smcneece)
// Description: Intelligent Gmail storage management using mathematical precision
// GitHub: https://github.com/smcneece/gmail-smart-storage-manager

function smartCleanupCheck() {
  try {
    console.log('Starting smart hourly storage cleanup...');
    
    // ====================================================================
    // CONFIGURATION - EDIT THESE VALUES FOR YOUR SETUP
    // ====================================================================
    const STORAGE_THRESHOLD = 0.75; // 75% triggers cleanup (PRODUCTION)
    const TARGET_FOLDER = 'in:sent'; // Target sent items (PRODUCTION)
    const REPORT_EMAIL = 'your-email@example.com'; // CHANGE THIS TO YOUR EMAIL
    // ====================================================================
    
    // Get current storage usage
    const storageInfo = getStorageUsage();
    const usedGB = storageInfo.usedGB;
    const totalGB = storageInfo.totalGB;
    const usagePercent = (usedGB / totalGB) * 100;
    
    console.log(`Current usage: ${usedGB}GB of ${totalGB}GB (${Math.round(usagePercent)}%)`);
    
    // Only cleanup if over threshold
    if (usagePercent > (STORAGE_THRESHOLD * 100)) {
      console.log(`Storage over ${STORAGE_THRESHOLD * 100}% - calculating smart cleanup...`);
      
      // Do the smart math to figure out exactly how many emails to delete
      const cleanupPlan = calculateSmartCleanup(usedGB, totalGB, STORAGE_THRESHOLD, TARGET_FOLDER);
      
      if (cleanupPlan.emailsToDelete > 0) {
        console.log(`Smart cleanup plan: delete ${cleanupPlan.emailsToDelete} emails (${cleanupPlan.mbToFree}MB) from ${TARGET_FOLDER}`);
        
        // Execute the cleanup
        const cleanupResult = deleteEmailBatch(TARGET_FOLDER, cleanupPlan.emailsToDelete);
        
        console.log(`Smart cleanup complete: deleted ${cleanupResult.emailsDeleted} emails`);
        
        // Record this cleanup event
        recordCleanupEvent(cleanupResult.emailsDeleted, cleanupResult.mbFreed);
      } else {
        console.log('No emails available to delete in target folder');
      }
      
    } else {
      console.log(`Storage under ${STORAGE_THRESHOLD * 100}% threshold - no cleanup needed`);
    }
    
  } catch (error) {
    console.error('Error in smart cleanup check:', error);
  }
}

function calculateSmartCleanup(usedGB, totalGB, targetThreshold, targetFolder) {
  try {
    console.log('Calculating smart cleanup plan...');
    
    // Calculate how much storage we need to free
    const currentUsagePercent = usedGB / totalGB;
    const targetUsagePercent = targetThreshold * 0.95; // Go slightly under threshold for buffer
    const storageToFreeGB = (currentUsagePercent - targetUsagePercent) * totalGB;
    const storageToFreeMB = storageToFreeGB * 1024;
    
    console.log(`Need to free: ${storageToFreeGB.toFixed(2)}GB (${Math.round(storageToFreeMB)}MB)`);
    
    // Count total emails across all folders to calculate average email size
    const emailCounts = countAllEmails();
    console.log(`Email counts: Inbox: ${emailCounts.inbox}, Sent: ${emailCounts.sent}, Trash: ${emailCounts.trash}, Total: ${emailCounts.total}`);
    
    // Calculate average email size
    const averageEmailSizeMB = emailCounts.total > 0 ? (usedGB * 1024) / emailCounts.total : 1;
    console.log(`Average email size: ${averageEmailSizeMB.toFixed(2)}MB`);
    
    // Calculate how many emails to delete
    const emailsToDelete = Math.ceil(storageToFreeMB / averageEmailSizeMB);
    
    // Make sure we don't try to delete more emails than exist in target folder
    const targetFolderCount = getTargetFolderCount(targetFolder);
    const actualEmailsToDelete = Math.min(emailsToDelete, targetFolderCount);
    
    console.log(`Target folder ${targetFolder} has ${targetFolderCount} emails`);
    console.log(`Calculated need to delete: ${emailsToDelete} emails, actual plan: ${actualEmailsToDelete} emails`);
    
    return {
      emailsToDelete: actualEmailsToDelete,
      mbToFree: Math.round(actualEmailsToDelete * averageEmailSizeMB),
      averageEmailSize: averageEmailSizeMB,
      targetFolderCount: targetFolderCount
    };
    
  } catch (error) {
    console.error('Error calculating smart cleanup:', error);
    return { emailsToDelete: 0, mbToFree: 0, averageEmailSize: 0, targetFolderCount: 0 };
  }
}

function countAllEmails() {
  try {
    console.log('Counting all emails (this may take a moment)...');
    
    // Count emails in major folders - get ALL results, not just first 500
    const inboxCount = getFullEmailCount('in:inbox');
    const sentCount = getFullEmailCount('in:sent');
    const trashCount = getFullEmailCount('in:trash');
    const spamCount = getFullEmailCount('in:spam');
    
    const counts = {
      inbox: inboxCount,
      sent: sentCount,
      trash: trashCount,
      spam: spamCount,
      total: inboxCount + sentCount + trashCount + spamCount
    };
    
    console.log(`Email count complete: ${counts.total} total emails`);
    return counts;
    
  } catch (error) {
    console.error('Error counting emails:', error);
    return { inbox: 0, sent: 0, trash: 0, spam: 0, total: 1000 }; // Default fallback
  }
}

function getFullEmailCount(searchQuery) {
  try {
    // Gmail search has limits, so we need to count in batches
    let totalCount = 0;
    let hasMore = true;
    let start = 0;
    const batchSize = 500; // Gmail's max per search
    
    while (hasMore) {
      const threads = GmailApp.search(searchQuery, start, batchSize);
      totalCount += threads.length;
      
      if (threads.length < batchSize) {
        // We got fewer than requested, so we're done
        hasMore = false;
      } else {
        // There might be more, continue with next batch
        start += batchSize;
      }
      
      // Safety break to avoid infinite loops
      if (start > 20000) {
        console.log(`Hit safety limit at ${start} emails for ${searchQuery}`);
        break;
      }
    }
    
    console.log(`${searchQuery}: ${totalCount} emails`);
    return totalCount;
    
  } catch (error) {
    console.error(`Error counting emails for ${searchQuery}:`, error);
    return 0;
  }
}

function getTargetFolderCount(targetFolder) {
  try {
    // Use the same full counting method for target folder
    return getFullEmailCount(targetFolder);
  } catch (error) {
    console.error('Error getting target folder count:', error);
    return 0;
  }
}

function deleteEmailBatch(targetFolder, maxEmails) {
  let emailsDeleted = 0;
  let mbFreed = 0;
  
  try {
    console.log(`Deleting batch of ${maxEmails} emails from ${targetFolder}...`);
    
    // Get oldest emails from target folder - process in chunks if needed
    const batchSize = Math.min(maxEmails, 100); // Gmail API limits, process 100 at a time
    let remaining = maxEmails;
    
    while (remaining > 0 && emailsDeleted < maxEmails) {
      const currentBatch = Math.min(remaining, batchSize);
      const threads = GmailApp.search(`${targetFolder} older_than:1d`, 0, currentBatch);
      
      if (threads.length === 0) {
        console.log('No more emails found to delete');
        break;
      }
      
      // Delete this batch
      for (let thread of threads) {
        try {
          // Estimate thread size (we'll improve this with real calculation later)
          const messages = thread.getMessages();
          const estimatedKB = messages.length * 50; // 50KB per message estimate
          mbFreed += estimatedKB / 1024;
          
          // Permanently delete based on folder
          if (targetFolder === 'in:trash') {
            // For emails already in trash, permanently delete
            const threadId = thread.getId();
            Gmail.Users.Threads.remove('me', threadId);
            emailsDeleted++;
          } else {
            // For other folders, move to trash
            thread.moveToTrash();
            emailsDeleted++;
          }
        } catch (error) {
          console.error('Error deleting thread:', error);
        }
      }
      
      remaining -= threads.length;
      console.log(`Deleted batch: ${threads.length} emails, total deleted: ${emailsDeleted}, remaining: ${remaining}`);
      
      // Small delay between batches to avoid rate limiting
      if (remaining > 0) {
        Utilities.sleep(1000);
      }
    }
    
    console.log(`Batch deletion complete: ${emailsDeleted} emails deleted`);
    
  } catch (error) {
    console.error('Error during batch deletion:', error);
  }
  
  return {
    emailsDeleted: emailsDeleted,
    mbFreed: Math.round(mbFreed)
  };
}

function getStorageUsage() {
  try {
    // Get actual Google account storage usage across all services
    var about = Drive.About.get({ fields: 'storageQuota' });
    
    if (about && about.storageQuota) {
      const usedBytes = parseInt(about.storageQuota.usage); // Total usage across Gmail + Drive + Photos
      const limitBytes = parseInt(about.storageQuota.limit); // Total storage limit
      
      const usedGB = usedBytes / (1024 * 1024 * 1024); // Convert to GB
      const totalGB = limitBytes / (1024 * 1024 * 1024); // Convert to GB
      
      console.log(`Actual storage via Drive API: ${usedGB.toFixed(2)}GB of ${totalGB.toFixed(2)}GB`);
      
      return {
        usedGB: Math.round(usedGB * 100) / 100,
        totalGB: Math.round(totalGB * 100) / 100
      };
    } else {
      console.log('Could not retrieve storage quota information');
      throw new Error('Storage quota not available');
    }
    
  } catch (error) {
    console.error('Error getting storage usage:', error);
    // Fallback to DriveApp method
    try {
      const usedBytes = DriveApp.getStorageUsed();
      const totalBytes = DriveApp.getStorageLimit();
      const usedGB = usedBytes / (1024 * 1024 * 1024);
      const totalGB = totalBytes / (1024 * 1024 * 1024);
      
      console.log(`Fallback storage: ${usedGB.toFixed(2)}GB of ${totalGB.toFixed(2)}GB`);
      
      return {
        usedGB: Math.round(usedGB * 100) / 100,
        totalGB: Math.round(totalGB * 100) / 100
      };
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
      // Return conservative estimate
      return {
        usedGB: 3, // Conservative estimate based on your 14% of 17GB
        totalGB: 17
      };
    }
  }
}

function recordCleanupEvent(emailsDeleted, mbFreed) {
  // Store cleanup events for daily reporting
  try {
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const properties = PropertiesService.getScriptProperties();
    
    // Get existing data for today
    const existingData = properties.getProperty(`cleanup_${today}`);
    let todayStats = existingData ? JSON.parse(existingData) : { emailsDeleted: 0, mbFreed: 0, runs: 0 };
    
    // Add this run's data
    todayStats.emailsDeleted += emailsDeleted;
    todayStats.mbFreed += mbFreed;
    todayStats.runs += 1;
    
    // Save updated data
    properties.setProperty(`cleanup_${today}`, JSON.stringify(todayStats));
    
    console.log(`Recorded cleanup event: ${emailsDeleted} emails, ${mbFreed}MB (daily total: ${todayStats.emailsDeleted} emails)`);
    
  } catch (error) {
    console.error('Error recording cleanup event:', error);
  }
}

function sendDailyReport() {
  try {
    // ====================================================================
    // CONFIGURATION - EDIT THIS EMAIL ADDRESS
    // ====================================================================
    const REPORT_EMAIL = 'your-email@example.com'; // CHANGE THIS TO YOUR EMAIL
    // ====================================================================
    
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    
    // Get current storage
    const storageInfo = getStorageUsage();
    const usedGB = storageInfo.usedGB;
    const totalGB = storageInfo.totalGB;
    const freeGB = Math.round((totalGB - usedGB) * 100) / 100;
    const usagePercent = (usedGB / totalGB) * 100;
    
    // Get email counts
    const emailCounts = countAllEmails();
    
    // Get today's cleanup stats
    const properties = PropertiesService.getScriptProperties();
    const cleanupData = properties.getProperty(`cleanup_${today}`);
    const todayStats = cleanupData ? JSON.parse(cleanupData) : { emailsDeleted: 0, mbFreed: 0, runs: 0 };
    
    const subject = `Daily Gmail Storage Report - ${Math.round(usagePercent)}% Used`;
    
    let body = `Daily Storage Report\n`;
    body += `=====================\n\n`;
    body += `Storage Status:\n`;
    body += `- Used: ${usedGB} GB of ${totalGB} GB\n`;
    body += `- Free: ${freeGB} GB\n`;
    body += `- Usage: ${Math.round(usagePercent)}%\n\n`;
    
    body += `Email Counts:\n`;
    body += `- Inbox: ${emailCounts.inbox} emails\n`;
    body += `- Sent: ${emailCounts.sent} emails\n`;
    body += `- Trash: ${emailCounts.trash} emails\n`;
    body += `- Total: ${emailCounts.total} emails\n\n`;
    
    if (todayStats.emailsDeleted > 0) {
      body += `Cleanup Activity Today:\n`;
      body += `- Cleanup runs: ${todayStats.runs}\n`;
      body += `- Emails deleted: ${todayStats.emailsDeleted}\n`;
      body += `- Space freed: ~${todayStats.mbFreed} MB\n\n`;
    } else {
      body += `No cleanup needed today - storage under threshold\n\n`;
    }
    
    body += `Smart cleanup runs hourly and calculates exact number of emails to delete.\n`;
    body += `Daily reports sent at 6AM.\n`;
    body += `\nGenerated: ${new Date().toString()}`;
    
    GmailApp.sendEmail(REPORT_EMAIL, subject, body);
    console.log('Daily report sent successfully');
    
    // Clean up old cleanup data (keep last 7 days)
    cleanupOldCleanupData();
    
  } catch (error) {
    console.error('Error sending daily report:', error);
  }
}

function cleanupOldCleanupData() {
  try {
    const properties = PropertiesService.getScriptProperties();
    const allProperties = properties.getProperties();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // Keep 7 days
    
    for (const key in allProperties) {
      if (key.startsWith('cleanup_')) {
        const dateStr = key.replace('cleanup_', '');
        const propDate = new Date(dateStr);
        if (propDate < cutoffDate) {
          properties.deleteProperty(key);
          console.log(`Cleaned up old data: ${key}`);
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning up old data:', error);
  }
}

// Manual test functions
function testSmartCleanup() {
  console.log('Running manual smart cleanup test...');
  smartCleanupCheck();
}

function testDailyReport() {
  console.log('Running manual daily report test...');
  sendDailyReport();
}

function testEmailCount() {
  console.log('Running manual email count test...');
  const counts = countAllEmails();
  console.log('Email counts:', counts);
}