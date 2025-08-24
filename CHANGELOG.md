# Changelog

All notable changes to Gmail Smart Storage Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to Home Assistant versioning: `YYYY.MM.VV`.

## [Unreleased] - 2025-08-23

### Added
- **DRY_RUN mode** - Safe testing without actual email deletion
- **Safety locks** - LockService prevents overlapping cleanup runs
- **Hard caps** - MAX_DELETE_PER_RUN prevents accidental mass deletion
- **Real size calculations** - Gmail API sizeEstimate replaces fake 50KB estimates
- **Smart sampling** - 200-email sampling for accurate average size calculations
- **Enhanced error handling** - Safe abort on storage detection failure
- **Simple targeting** - Direct folder targeting without complex query building
- **Performance optimization** - 200-email batches with 500ms delays (4x speed improvement)
- **Real-time precision** - Storage monitoring during cleanup prevents over-deletion
- **Comprehensive logging** - Detailed execution information for troubleshooting
- **Error notifications** - Email alerts when cleanup encounters problems

### Changed
- **JavaScript compatibility** - Replaced ES6 const/let with var for Google Apps Script
- **String handling** - Traditional concatenation replaces template literals
- **Storage detection** - Script aborts safely if unable to determine storage usage
- **Simplified configuration** - Removed complex query logic, just TARGET_FOLDER
- **Size estimation fallbacks** - Improved accuracy with 100KB base + 50KB per message

### Removed
- **Overcomplicated filtering** - Removed starred/important email exclusions
- **Age-based restrictions** - Simplified to delete oldest first
- **Complex targeting logic** - Streamlined to simple folder targeting

### Fixed
- **Variable scoping errors** - Resolved JavaScript compatibility issues
- **Target folder logic** - Simplified targeting eliminates configuration conflicts
- **API failure handling** - Proper error handling when Gmail/Drive APIs unavailable

### Security
- **Simple safety model** - DRY_RUN and caps provide protection
- **Audit-ready code** - Clean, straightforward logic easy to verify
- **No hidden behaviors** - What you configure is exactly what it does

### Performance
- **4x speed improvement** - Optimized batch processing and API calls
- **Better API usage** - Efficient Gmail API calls with proper rate limiting
- **Enhanced sampling** - More accurate calculations with real message sizes
- **Maintained mathematical precision** - Still calculates exact deletion needs

## [2025.08.2] - 2025-08-22

### Changed
- Simplified email configuration to single global constant
- Added automatic Gmail account detection for reports
- Default configuration now works without editing (auto-detects email)
- Improved user experience with zero required configuration

### Technical
- Added `getReportEmail()` function with smart email detection
- Gmail API profile detection with Session fallback
- Consolidated email configuration from two locations to one

## [2025.08.1] - 2025-08-22

### Added
- Initial release with mathematical precision cleanup algorithm
- Smart email counting across all Gmail folders (inbox, sent, trash, spam)
- Advanced Drive API integration for accurate total storage monitoring
- Configurable storage thresholds and target folder selection
- Automated hourly monitoring with intelligent cleanup calculations
- Daily email reports with detailed storage statistics and cleanup summaries
- Evidence preservation mode for security and forensic use cases
- Comprehensive error handling with email notifications
- Batch processing with Gmail API rate limiting
- Professional documentation with setup screenshots
- Zero-configuration operation after initial setup

### Features
- Mathematical precision: Calculate exact number of emails to delete
- Automatic Google storage monitoring across Gmail + Drive + Photos
- Smart target folder selection (sent items, trash, inbox, custom labels)
- Hourly intelligent monitoring with precise cleanup calculations
- Comprehensive safety features and error handling
- Professional setup documentation with visual guides

### Supported Use Cases
- Security camera systems (Blue Iris, motion alerts)
- Android device accounts (backup photos, app data)
- Business Gmail accounts with high email volume
- Evidence preservation scenarios
- Automated systems sending status emails
- Data retention compliance requirements

[2025.08.2]: https://github.com/smcneece/gmail-cleanup-script/releases/tag/v2025.08.2
[2025.08.1]: https://github.com/smcneece/gmail-cleanup-script/releases/tag/v2025.08.1