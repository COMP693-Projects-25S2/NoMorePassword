/**
 * Test script for SyncManager functionality
 * This script can be used to test the user activity synchronization features
 */

const { getCClientLogger } = require('./utils/logger');

class SyncTestRunner {
    constructor() {
        this.logger = getCClientLogger('sync_test');
    }

    /**
     * Test SyncManager initialization
     */
    async testSyncManagerInit() {
        try {
            this.logger.info('🧪 Testing SyncManager initialization...');

            const SyncManager = require('./syncManager/syncManager');

            // Mock database and main window
            const mockDatabase = {
                get: (query, params, callback) => {
                    this.logger.info(`Mock DB get: ${query} with params:`, params);
                    // Simulate no previous sync (will use default 2025-01-01)
                    callback(null, null);
                },
                all: (query, params, callback) => {
                    this.logger.info(`Mock DB all: ${query} with params:`, params);
                    callback(null, []); // Simulate no new activities
                },
                run: (query, params, callback) => {
                    this.logger.info(`Mock DB run: ${query} with params:`, params);
                    callback.call({ lastID: 1 }, null); // Simulate successful insert
                }
            };

            const mockMainWindow = {
                webSocketClient: {
                    sendMessage: async (message) => {
                        this.logger.info('Mock WebSocket send:', message);
                        return Promise.resolve();
                    }
                }
            };

            const syncManager = new SyncManager(mockMainWindow, mockDatabase);

            this.logger.info('✅ SyncManager initialized successfully');
            return syncManager;

        } catch (error) {
            this.logger.error('❌ SyncManager initialization failed:', error);
            throw error;
        }
    }

    /**
     * Test sync data structure
     */
    testSyncDataStructure() {
        try {
            this.logger.info('🧪 Testing sync data structure...');

            const testBatchData = {
                batch_id: 'test-batch-123',
                user_id: 'test-user-456',
                activities: [
                    {
                        id: 1,
                        url: 'https://example.com/page1',
                        title: 'Test Page 1',
                        description: 'Test description 1',
                        visit_time: new Date().toISOString(),
                        duration: 30,
                        created_at: new Date().toISOString()
                    },
                    {
                        id: 2,
                        url: 'https://example.com/page2',
                        title: 'Test Page 2',
                        description: 'Test description 2',
                        visit_time: new Date().toISOString(),
                        duration: 45,
                        created_at: new Date().toISOString()
                    }
                ],
                timestamp: new Date().toISOString(),
                count: 2
            };

            this.logger.info('✅ Test batch data structure:', testBatchData);
            return testBatchData;

        } catch (error) {
            this.logger.error('❌ Sync data structure test failed:', error);
            throw error;
        }
    }

    /**
     * Test batch feedback handling
     */
    testBatchFeedback(syncManager) {
        try {
            this.logger.info('🧪 Testing batch feedback handling...');

            // Simulate pending batch
            const testBatchId = 'test-feedback-batch-789';
            syncManager.pendingBatches.set(testBatchId, {
                data: {
                    batch_id: testBatchId,
                    user_id: 'test-user',
                    activities: [],
                    timestamp: new Date().toISOString()
                },
                timestamp: Date.now()
            });

            // Test successful feedback
            syncManager.handleBatchFeedback(testBatchId, true, 'Batch processed successfully');

            // Test failed feedback
            syncManager.handleBatchFeedback(testBatchId, false, 'Batch processing failed');

            this.logger.info('✅ Batch feedback handling test completed');

        } catch (error) {
            this.logger.error('❌ Batch feedback test failed:', error);
            throw error;
        }
    }

    /**
     * Test incoming activities handling
     */
    async testIncomingActivities(syncManager) {
        try {
            this.logger.info('🧪 Testing incoming activities handling...');

            const testIncomingData = {
                batch_id: 'incoming-batch-999',
                user_id: 'incoming-user-888',
                activities: [
                    {
                        id: 10,
                        url: 'https://incoming.com/page1',
                        title: 'Incoming Page 1',
                        description: 'Incoming description 1',
                        visit_time: new Date().toISOString(),
                        duration: 60,
                        created_at: new Date().toISOString()
                    }
                ],
                timestamp: new Date().toISOString(),
                count: 1
            };

            await syncManager.handleIncomingActivities(testIncomingData);

            this.logger.info('✅ Incoming activities handling test completed');

        } catch (error) {
            this.logger.error('❌ Incoming activities test failed:', error);
            throw error;
        }
    }

    /**
     * Test first-time sync behavior
     */
    async testFirstTimeSync(syncManager) {
        try {
            this.logger.info('🧪 Testing first-time sync behavior...');

            // Test getLastSyncTime with no previous sync data
            const lastSyncTime = await syncManager.getLastSyncTime();

            if (lastSyncTime === '2025-01-01T00:00:00.000Z') {
                this.logger.info('✅ First-time sync correctly returns 2025-01-01 default time');
            } else {
                throw new Error(`Expected 2025-01-01T00:00:00.000Z, got ${lastSyncTime}`);
            }

            // Test getNewActivities with default time (should return all activities)
            const mockDatabase = {
                all: (query, params, callback) => {
                    this.logger.info(`Mock DB all (first sync): ${query} with params:`, params);
                    // Simulate returning all activities since 2025-01-01
                    callback(null, [
                        {
                            id: 1,
                            url: 'https://example.com/page1',
                            title: 'All Time Page 1',
                            description: 'Historical activity 1',
                            visit_time: new Date().toISOString(),
                            duration: 30,
                            created_at: new Date().toISOString()
                        },
                        {
                            id: 2,
                            url: 'https://example.com/page2',
                            title: 'All Time Page 2',
                            description: 'Historical activity 2',
                            visit_time: new Date().toISOString(),
                            duration: 45,
                            created_at: new Date().toISOString()
                        }
                    ]);
                }
            };

            // Temporarily replace database for this test
            const originalDatabase = syncManager.database;
            syncManager.database = mockDatabase;

            const newActivities = await syncManager.getNewActivities(lastSyncTime);

            if (newActivities.length === 2) {
                this.logger.info('✅ First-time sync correctly retrieves all historical activities');
            } else {
                throw new Error(`Expected 2 activities, got ${newActivities.length}`);
            }

            // Restore original database
            syncManager.database = originalDatabase;

            this.logger.info('✅ First-time sync behavior test completed');

        } catch (error) {
            this.logger.error('❌ First-time sync test failed:', error);
            throw error;
        }
    }

    /**
     * Run all tests
     */
    async runAllTests() {
        try {
            this.logger.info('🚀 Starting SyncManager functionality tests...');

            // Test 1: Initialize SyncManager
            const syncManager = await this.testSyncManagerInit();

            // Test 2: Test data structure
            const testData = this.testSyncDataStructure();

            // Test 3: Test batch feedback
            this.testBatchFeedback(syncManager);

            // Test 4: Test incoming activities
            await this.testIncomingActivities(syncManager);

            // Test 5: Test first-time sync behavior
            await this.testFirstTimeSync(syncManager);

            this.logger.info('✅ All SyncManager tests completed successfully!');

        } catch (error) {
            this.logger.error('❌ SyncManager tests failed:', error);
            throw error;
        }
    }
}

// Export for use in other modules
module.exports = SyncTestRunner;

// Run tests if this file is executed directly
if (require.main === module) {
    const testRunner = new SyncTestRunner();
    testRunner.runAllTests()
        .then(() => {
            console.log('🎉 All tests completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Tests failed:', error);
            process.exit(1);
        });
}
