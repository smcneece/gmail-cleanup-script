// Gmail Smart Storage Manager
// Version: 2025.8.4
// Author: Shawn McNeece (@smcneece)
// Description: Simple Gmail storage management using mathematical precision
// GitHub: https://github.com/smcneece/gmail-cleanup-script

// ====================================================================
// CONFIGURATION - EDIT THESE VALUES
// ====================================================================
var REPORT_EMAIL = ''; // Leave blank for auto-detection, or enter 'your-email@example.com'

// Safety Settings
var DRY_RUN = true; // Set to false after testing - ALWAYS TEST FIRST!
var MAX_DELETE_PER_RUN = 2000; // Hard cap per cleanup run (prevents accidental mass deletion)

// Storage Settings  
var STORAGE_THRESHOLD = 0.75; // 75% triggers cleanup

// Target Settings
var TARGET_FOLDER = 'in:sent'; // Target these items - sent, trash, inbox, or any folder
// ====================================================================

function smartCleanupCheck() {
  // Prevent overlapping runs
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.log('Another cleanup is already running. Exiting.');
    return;
  }
  
  try {
    console.log('Starting smart storage cleanup...');
    
    // Get current storage usage
    var storageInfo = getStorageUsage();
    var usedGB = storageInfo.usedGB;
    var totalGB = storageInfo.totalGB;
    var usagePercent = (usedGB / totalGB);
    
    console.log('Current usage: ' + usedGB + 'GB of ' + totalGB + 'GB (' + Math.round(usagePercent * 100) + '%)');
    
    // Only cleanup if over threshold
    if (usagePercent > STORAGE_THRESHOLD) {
      console.log('Storage over ' + Math.round(STORAGE_THRESHOLD * 100) + '% - calculating cleanup...');
      
      // Calculate exactly how many emails to delete
      var cleanupPlan = calculateSmartCleanup(usedGB, totalGB, STORAGE_THRESHOLD, TARGET_FOLDER);
      
      if (cleanupPlan.emailsToDelete > 0) {
        var action = DRY_RUN ? 'would delete' : 'deleting';
        console.log('Cleanup plan: ' + action + ' ' + cleanupPlan.emailsToDelete + ' emails (~' + cleanupPlan.mbToFree + 'MB) from ' + TARGET_FOLDER);
        
        // Execute the cleanup
        var cleanupResult = deleteEmailBatch(TARGET_FOLDER, cleanupPlan.emailsToDelete);
        
        var completed = DRY_RUN ? 'simulated deletion of' : 'deleted';
        console.log('Cleanup complete: ' + completed + ' ' + cleanupResult.emailsDeleted + ' emails (~' + cleanupResult.mbFreed + 'MB)');
        
        // Record this cleanup event (only if not dry run)
        if (!DRY_RUN) {
          recordCleanupEvent(cleanupResult.emailsDeleted, cleanupResult.mbFreed);
        }
      } else {
        console.log('No emails available to delete in target folder');
      }
      
    } else {
      console.log('Storage under ' + Math.round(STORAGE_THRESHOLD * 100) + '% threshold - no cleanup needed');
    }
    
  } catch (error) {
    console.error('Error in cleanup:', error);
    // Send error notification
    try {
      var reportEmail = getReportEmail();
      GmailApp.sendEmail(reportEmail, 'Gmail Cleanup Error', 'Error during cleanup: ' + error.toString());
    } catch (emailError) {
      console.error('Could not send error email:', emailError);
    }
  } finally {
    lock.releaseLock();
  }
}

function calculateSmartCleanup(usedGB, totalGB, targetThreshold, targetFolder) {
  try {
    console.log('Calculating cleanup plan...');
    
    // Calculate how much storage we need to free
    var currentUsagePercent = usedGB / totalGB;
    var storageToFreeGB = (currentUsagePercent - targetThreshold) * totalGB;
    var storageToFreeMB = storageToFreeGB * 1024;
    
    console.log('Need to free: ' + storageToFreeGB.toFixed(2) + 'GB (' + Math.round(storageToFreeMB) + 'MB)');
    
    // Sample emails for size calculation
    var emailSample = sampleTargetEmails(targetFolder, 200);
    
    if (emailSample.totalEmails === 0) {
      console.log('No emails found in target folder');
      return { emailsToDelete: 0, mbToFree: 0, averageEmailSize: 0, targetFolderCount: 0 };
    }
    
    console.log('Target folder: ' + emailSample.totalEmails + ' emails, average size: ' + emailSample.averageSize.toFixed(2) + 'MB');
    
    // Calculate how many emails to delete
    var emailsToDelete = Math.ceil(storageToFreeMB / emailSample.averageSize);
    
    // Apply hard cap
    var actualEmailsToDelete = Math.min(emailsToDelete, MAX_DELETE_PER_RUN, emailSample.totalEmails);
    
    console.log('Calculated need: ' + emailsToDelete + ' emails, capped at: ' + actualEmailsToDelete + ' emails');
    
    return {
      emailsToDelete: actualEmailsToDelete,
      mbToFree: Math.round(actualEmailsToDelete * emailSample.averageSize),
      averageEmailSize: emailSample.averageSize,
      targetFolderCount: emailSample.totalEmails
    };
    
  } catch (error) {
    console.error('Error calculating cleanup:', error);
    return { emailsToDelete: 0, mbToFree: 0, averageEmailSize: 0, targetFolderCount: 0 };
  }
}

function sampleTargetEmails(query, sampleSize) {
  try {
    console.log('Sampling emails from: ' + query);
    
    // Get total count first
    var totalCount = getFullEmailCount(query);
    console.log('Found ' + totalCount + ' total emails in target folder');
    
    if (totalCount === 0) {
      return { totalEmails: 0, averageSize: 0 };
    }
    
    // Sample emails for size calculation using Gmail API for accuracy
    var actualSampleSize = Math.min(sampleSize, totalCount);
    console.log('Sampling ' + actualSampleSize + ' emails for size calculation...');
    
    var totalSizeBytes = 0;
    var sampledCount = 0;
    
    try {
      // Use Gmail API to get message IDs
      var messageList = Gmail.Users.Messages.list('me', {
        q: query,
        maxResults: actualSampleSize,
        fields: 'messages(id)'
      });
      
      if (messageList && messageList.messages) {
        for (var i = 0; i < messageList.messages.length; i++) {
          var message = messageList.messages[i];
          try {
            // Get real size using Gmail API
            var messageInfo = Gmail.Users.Messages.get('me', message.id, {
              format: 'metadata',
              fields: 'sizeEstimate'
            });
            
            if (messageInfo && messageInfo.sizeEstimate) {
              totalSizeBytes += messageInfo.sizeEstimate;
              sampledCount++;
            }
          } catch (msgError) {
            console.log('Could not get size for message ' + message.id + ': ' + msgError);
          }
          
          // Small delay to be nice to API
          if (sampledCount % 10 === 0) {
            Utilities.sleep(100);
          }
        }
      }
    } catch (apiError) {
      console.log('Gmail API sampling failed, using fallback estimation');
      // Fallback: use thread-based estimation
      var threads = GmailApp.search(query, 0, actualSampleSize);
      for (var j = 0; j < threads.length; j++) {
        var thread = threads[j];
        var messages = thread.getMessages();
        // Improved estimation: 100KB base + 50KB per additional message in thread
        var estimatedBytes = (100 + (messages.length - 1) * 50) * 1024;
        totalSizeBytes += estimatedBytes;
        sampledCount++;
      }
    }
    
    var averageSizeBytes = sampledCount > 0 ? totalSizeBytes / sampledCount : 500 * 1024; // 500KB fallback
    var averageSizeMB = averageSizeBytes / (1024 * 1024);
    
    console.log('Size sampling complete: ' + sampledCount + ' emails sampled, average ' + averageSizeMB.toFixed(2) + 'MB');
    
    return {
      totalEmails: totalCount,
      averageSize: averageSizeMB
    };
    
  } catch (error) {
    console.error('Error sampling target emails:', error);
    return { totalEmails: 0, averageSize: 0.5 }; // 500KB fallback
  }
}

function getFullEmailCount(searchQuery) {
  try {
    // Gmail search has limits, so we need to count in batches
    var totalCount = 0;
    var hasMore = true;
    var start = 0;
    var batchSize = 500; // Gmail's max per search
    
    while (hasMore) {
      var threads = GmailApp.search(searchQuery, start, batchSize);
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
        console.log('Hit safety limit at ' + start + ' emails for ' + searchQuery);
        break;
      }
    }
    
    console.log(searchQuery + ': ' + totalCount + ' emails');
    return totalCount;
    
  } catch (error) {
    console.error('Error counting emails for ' + searchQuery + ':', error);
    return 0;
  }
}

function deleteEmailBatch(targetFolder, maxEmails) {
  var emailsDeleted = 0;
  var mbFreed = 0;
  
  try {
    var query = targetFolder;
    var action = DRY_RUN ? 'simulating deletion of' : 'deleting';
    console.log(action + ' up to ' + maxEmails + ' emails from: ' + query);
    
    // Process in batches to respect API limits
    var batchSize = 200;
    var remaining = maxEmails;
    
    while (remaining > 0 && emailsDeleted < maxEmails) {
      var currentBatch = Math.min(remaining, batchSize);
      var threads = GmailApp.search(query, 0, currentBatch);
      
      if (threads.length === 0) {
        console.log('No more emails found to delete');
        break;
      }
      
      // Check storage every 400 emails to avoid over-deletion (reduced from every 200)
      if (emailsDeleted > 0 && emailsDeleted % 400 === 0) {
        try {
          var currentStorage = getStorageUsage();
          var currentUsagePercent = currentStorage.usedGB / currentStorage.totalGB;
          if (currentUsagePercent <= STORAGE_THRESHOLD) {
            console.log('Storage threshold reached during cleanup - stopping early');
            console.log('Current usage: ' + Math.round(currentUsagePercent * 100) + '%, target: ' + Math.round(STORAGE_THRESHOLD * 100) + '%');
            break;
          }
        } catch (storageCheckError) {
          console.log('Could not check storage mid-cleanup, continuing: ' + storageCheckError);
        }
      }
      
      // Delete this batch
      for (var i = 0; i < threads.length; i++) {
        if (emailsDeleted >= maxEmails) break;
        
        var thread = threads[i];
        try {
          // Calculate size for tracking
          var threadSizeMB = 0;
          
          if (!DRY_RUN) {
            // Get real size for tracking
            try {
              var threadId = thread.getId();
              var threadInfo = Gmail.Users.Threads.get('me', threadId, {
                format: 'metadata',
                fields: 'messages(sizeEstimate)'
              });
              
              if (threadInfo && threadInfo.messages) {
                var totalBytes = 0;
                for (var j = 0; j < threadInfo.messages.length; j++) {
                  totalBytes += threadInfo.messages[j].sizeEstimate || 0;
                }
                threadSizeMB = totalBytes / (1024 * 1024);
              }
            } catch (sizeError) {
              // Fallback estimation
              var messages = thread.getMessages();
              threadSizeMB = (100 + (messages.length - 1) * 50) / 1024; // KB to MB
            }
          } else {
            // For dry run, use estimation
            var messages = thread.getMessages();
            threadSizeMB = (100 + (messages.length - 1) * 50) / 1024;
          }
          
          mbFreed += threadSizeMB;
          
          // Actually delete (or simulate)
          if (!DRY_RUN) {
            if (targetFolder === 'in:trash') {
              // Permanently delete from trash
              var threadId = thread.getId();
              Gmail.Users.Threads.remove('me', threadId);
            } else {
              // Move to trash first, then permanently delete
              thread.moveToTrash();
              // Wait a moment then permanently delete
              Utilities.sleep(500);
              var threadId = thread.getId();
              Gmail.Users.Threads.remove('me', threadId);
            }
          }
          
          emailsDeleted++;
          
        } catch (error) {
          console.error('Error processing thread:', error);
        }
      }
      
      remaining -= threads.length;
      var status = DRY_RUN ? 'simulated' : 'deleted';
      console.log('Batch ' + status + ': ' + threads.length + ' emails, total: ' + emailsDeleted + ', remaining: ' + remaining);
      
      // Delay between batches to be nice to API
      if (remaining > 0) {
        Utilities.sleep(500);
      }
    }
    
    var finalAction = DRY_RUN ? 'Simulation complete' : 'Batch deletion complete';
    console.log(finalAction + ': ' + emailsDeleted + ' emails processed, ~' + Math.round(mbFreed) + 'MB');
    
  } catch (error) {
    console.error('Error during batch processing:', error);
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
      var usedBytes = parseInt(about.storageQuota.usage);
      var limitBytes = parseInt(about.storageQuota.limit);
      
      var usedGB = usedBytes / (1024 * 1024 * 1024);
      var totalGB = limitBytes / (1024 * 1024 * 1024);
      
      console.log('Storage via Drive API: ' + usedGB.toFixed(2) + 'GB of ' + totalGB.toFixed(2) + 'GB');
      
      return {
        usedGB: Math.round(usedGB * 100) / 100,
        totalGB: Math.round(totalGB * 100) / 100
      };
    } else {
      throw new Error('Storage quota not available');
    }
    
  } catch (error) {
    console.error('Error getting storage usage:', error);
    // Fallback to DriveApp method
    try {
      var usedBytes = DriveApp.getStorageUsed();
      var totalBytes = DriveApp.getStorageLimit();
      var usedGB = usedBytes / (1024 * 1024 * 1024);
      var totalGB = totalBytes / (1024 * 1024 * 1024);
      
      console.log('Fallback storage: ' + usedGB.toFixed(2) + 'GB of ' + totalGB.toFixed(2) + 'GB');
      
      return {
        usedGB: Math.round(usedGB * 100) / 100,
        totalGB: Math.round(totalGB * 100) / 100
      };
    } catch (fallbackError) {
      console.error('Both storage methods failed:', fallbackError);
      throw new Error('Cannot determine storage usage - aborting cleanup for safety');
    }
  }
}

function recordCleanupEvent(emailsDeleted, mbFreed) {
  try {
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var properties = PropertiesService.getScriptProperties();
    
    // Get existing data for today
    var existingData = properties.getProperty('cleanup_' + today);
    var todayStats = existingData ? JSON.parse(existingData) : { emailsDeleted: 0, mbFreed: 0, runs: 0 };
    
    // Add this run's data
    todayStats.emailsDeleted += emailsDeleted;
    todayStats.mbFreed += mbFreed;
    todayStats.runs += 1;
    
    // Save updated data
    properties.setProperty('cleanup_' + today, JSON.stringify(todayStats));
    
    console.log('Recorded cleanup event: ' + emailsDeleted + ' emails, ' + mbFreed + 'MB (daily total: ' + todayStats.emailsDeleted + ' emails)');
    
  } catch (error) {
    console.error('Error recording cleanup event:', error);
  }
}

function getReportEmail() {
  if (REPORT_EMAIL && REPORT_EMAIL.trim() !== '' && REPORT_EMAIL !== 'your-email@example.com') {
    return REPORT_EMAIL;
  }
  
  // Auto-detect Gmail account email address
  try {
    var profile = Gmail.Users.getProfile('me');
    if (profile && profile.emailAddress) {
      console.log('Auto-detected Gmail account: ' + profile.emailAddress);
      return profile.emailAddress;
    }
  } catch (error) {
    console.log('Could not auto-detect Gmail address, using fallback');
  }
  
  // Fallback to session
  try {
    var userEmail = Session.getActiveUser().getEmail();
    if (userEmail) {
      console.log('Using session email: ' + userEmail);
      return userEmail;
    }
  } catch (error) {
    console.log('Could not get session email');
  }
  
  console.log('Using configured REPORT_EMAIL');
  return REPORT_EMAIL;
}

function sendDailyReport() {
  try {
    var reportEmail = getReportEmail();
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    
    // Get current storage
    var storageInfo = getStorageUsage();
    var usedGB = storageInfo.usedGB;
    var totalGB = storageInfo.totalGB;
    var freeGB = Math.round((totalGB - usedGB) * 100) / 100;
    var usagePercent = (usedGB / totalGB) * 100;
    
    // Get email counts
    var emailCounts = countAllEmails();
    
    // Get today's cleanup stats
    var properties = PropertiesService.getScriptProperties();
    var cleanupData = properties.getProperty('cleanup_' + today);
    var todayStats = cleanupData ? JSON.parse(cleanupData) : { emailsDeleted: 0, mbFreed: 0, runs: 0 };
    
    var subject = 'Daily Gmail Storage Report - ' + Math.round(usagePercent) + '% Used' + (DRY_RUN ? ' (DRY RUN MODE)' : '');
    
    var body = 'Daily Storage Report\n';
    body += '=====================\n\n';
    
    if (DRY_RUN) {
      body += 'WARNING: DRY RUN MODE ACTIVE - No emails are actually deleted\n\n';
    }
    
    body += 'Storage Status:\n';
    body += '- Used: ' + usedGB + ' GB of ' + totalGB + ' GB\n';
    body += '- Free: ' + freeGB + ' GB\n';
    body += '- Usage: ' + Math.round(usagePercent) + '%\n\n';
    
    body += 'Email Counts:\n';
    body += '- Inbox: ' + emailCounts.inbox + ' emails\n';
    body += '- Sent: ' + emailCounts.sent + ' emails\n';
    body += '- Trash: ' + emailCounts.trash + ' emails\n';
    body += '- Total: ' + emailCounts.total + ' emails\n\n';
    
    if (todayStats.emailsDeleted > 0) {
      var action = DRY_RUN ? 'simulated' : 'deleted';
      body += 'Cleanup Activity Today:\n';
      body += '- Cleanup runs: ' + todayStats.runs + '\n';
      body += '- Emails ' + action + ': ' + todayStats.emailsDeleted + '\n';
      body += '- Space freed: ~' + todayStats.mbFreed + ' MB\n\n';
    } else {
      body += 'No cleanup needed today - storage under threshold\n\n';
    }
    
    body += 'Configuration:\n';
    body += '- Storage threshold: ' + Math.round(STORAGE_THRESHOLD * 100) + '%\n';
    body += '- Target folder: ' + TARGET_FOLDER + '\n';
    body += '- Max delete per run: ' + MAX_DELETE_PER_RUN + '\n';
    body += '- Dry run mode: ' + (DRY_RUN ? 'ON' : 'OFF') + '\n\n';
    
    body += 'Smart cleanup runs automatically when storage exceeds threshold.\n';
    body += 'Generated: ' + new Date().toString();
    
    GmailApp.sendEmail(reportEmail, subject, body);
    console.log('Daily report sent successfully to: ' + reportEmail);
    
    // Clean up old cleanup data (keep last 7 days)
    cleanupOldCleanupData();
    
  } catch (error) {
    console.error('Error sending daily report:', error);
  }
}

function countAllEmails() {
  try {
    console.log('Counting all emails (this may take a moment)...');
    
    // Count emails in major folders
    var inboxCount = getFullEmailCount('in:inbox');
    var sentCount = getFullEmailCount('in:sent');
    var trashCount = getFullEmailCount('in:trash');
    var spamCount = getFullEmailCount('in:spam');
    
    var counts = {
      inbox: inboxCount,
      sent: sentCount,
      trash: trashCount,
      spam: spamCount,
      total: inboxCount + sentCount + trashCount + spamCount
    };
    
    console.log('Email count complete: ' + counts.total + ' total emails');
    return counts;
    
  } catch (error) {
    console.error('Error counting emails:', error);
    return { inbox: 0, sent: 0, trash: 0, spam: 0, total: 1000 }; // Default fallback
  }
}

function cleanupOldCleanupData() {
  try {
    var properties = PropertiesService.getScriptProperties();
    var allProperties = properties.getProperties();
    var cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // Keep 7 days
    
    for (var key in allProperties) {
      if (key.indexOf('cleanup_') === 0) {
        var dateStr = key.replace('cleanup_', '');
        var propDate = new Date(dateStr);
        if (propDate < cutoffDate) {
          properties.deleteProperty(key);
          console.log('Cleaned up old data: ' + key);
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning up old data:', error);
  }
}

// Test Functions
function testSmartCleanup() {
  console.log('Running manual cleanup test...');
  smartCleanupCheck();
}

function testDailyReport() {
  console.log('Running manual daily report test...');
  sendDailyReport();
}

function testEmailCount() {
  console.log('Running manual email count test...');
  var counts = countAllEmails();
  console.log('Email counts:', counts);
}

function testDryRun() {
  console.log('Testing in dry-run mode...');
  console.log('Current DRY_RUN setting: ' + DRY_RUN);
  if (!DRY_RUN) {
    console.log('WARNING: DRY_RUN is currently FALSE - this would actually delete emails!');
    console.log('Set DRY_RUN = true at the top of the script to test safely');
  } else {
    console.log('DRY_RUN is ON - safe to test');
    smartCleanupCheck();
  }
}