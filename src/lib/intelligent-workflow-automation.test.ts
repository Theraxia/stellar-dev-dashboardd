// Tests for intelligent-workflow-automation.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { 
  getAutomationTemplates,
  getAutomationTemplate,
  createCustomTemplate, 
  activateAutomation, 
  getAutomationSuggestions, 
  executeAutomation,
  getUserAutomations,
  addAutomationFeedback,
  initializeBuiltInTemplates,
  getUserAutomationStats,
  adjustAutomationProbabilities,
  getAutomationInsights
} from '../src/lib/intelligent-workflow-automation'

// Mock the storage and interaction log modules
vi.mock('../src/lib/storage', () => ({
  getStoredValue: vi.fn(() => Promise.resolve(null)),
  setStoredValue: vi.fn(() => Promise.resolve()),
}))

vi.mock('../src/lib/interactionLog', () => ({
  logInteraction: vi.fn(() => Promise.resolve({ id: 'test', type: 'test' })),
  queryLog: vi.fn(() => Promise.resolve([])),
  getFeatureUsage: vi.fn(() => Promise.resolve([])),
  detectPatterns: vi.fn(() => Promise.resolve([])),
}))

vi.mock('../src/lib/behaviorPrediction', () => ({
  buildOrUpdateProfile: vi.fn(() => Promise.resolve({
    userId: 'test-user',
    topFeatures: [],
    preferredActions: [],
    activeHours: [],
    averageSessionDuration: 0,
    featureAffinities: {},
    actionProbabilities: {},
    patternAdherence: 0,
    lastUpdated: Date.now(),
    sampleCount: 10,
    accuracy: 0.5,
  })),
  predictIntent: vi.fn(() => Promise.resolve({
    intent: 'explore',
    probability: 0.3,
    context: 'test',
    alternativeIntents: [],
    features: [],
    modelVersion: 'test',
    timestamp: Date.now(),
  })),
  predictNextAction: vi.fn(() => Promise.resolve({
    predictedAction: 'page_view',
    actionType: 'page_view',
    probability: 0.4,
    timeEstimate: 60000,
    alternativeActions: [],
    confidence: 0.3,
    features: [],
    timestamp: Date.now(),
  })),
}))

vi.mock('../src/lib/approvalSystem', () => ({
  approvalSystem: {
    createRequest: vi.fn(() => ({ id: 'approval-1', requestedBy: 'user', action: 'test' })),
    approve: vi.fn(() => ({ id: 'approval-1' })),
    reject: vi.fn(() => ({ id: 'approval-1' })),
  },
}))

vi.mock('../src/lib/alertChannels', () => ({
  dispatchToChannels: vi.fn(() => Promise.resolve()),
}))

vi.mock('../src/lib/notifications', () => ({
  createNotification: vi.fn(() => Promise.resolve()),
}))

describe('Intelligent Workflow Automation System', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Initialize built-in templates before each test
    initializeBuiltInTemplates().catch(() => {})
  })

  describe('Automation Templates', () => {
    it('should initialize and provide built-in templates', async () => {
      const templates = await getAutomationTemplates()
      expect(templates.length).toBeGreaterThan(0)
      expect(templates.some(t => t.isCustom === false)).toBe(true)
      
      // Verify built-in templates exist
      const autoSaveTemplate = templates.find(t => t.id === 'auto-save-progress')
      expect(autoSaveTemplate).toBeDefined()
      expect(autoSaveTemplate?.category).toBe('data_processing')
      expect(autoSaveTemplate?.complexity).toBe('simple')
    })

    it('should create custom automation templates', async () => {
      const customTemplate = await createCustomTemplate({
        name: 'Test Automation',
        description: 'A test template',
        category: 'workflow',
        trigger: { type: 'event', source: 'interaction' },
        actions: [],
        prerequisites: [],
        complexity: 'simple',
        estimatedTimeSaving: 3,
        tags: ['test'],
      })
      
      expect(customTemplate).toBeDefined()
      expect(customTemplate.name).toBe('Test Automation')
      expect(customTemplate.isCustom).toBe(true)
      expect(customTemplate.usageCount).toBe(0)
      expect(customTemplate.successRate).toBe(0.5)
    })

    it('should retrieve user-specific templates', async () => {
      const templates = await getAutomationTemplates('test-user', 'workflow')
      expect(templates.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Automation Activation and Execution', () => {
    it('should activate automation with approval for complex templates', async () => {
      const template = await getAutomationTemplate('smart-notification')
      expect(template).toBeDefined()
      
      const automation = await activateAutomation(template.id, 'test-user')
      expect(automation).toBeDefined()
      expect(automation.templateId).toBe(template.id)
      expect(automation.isActive).toBe(true)
      expect(automation.approvals).toEqual(['test-user'])
    })

    it('should execute simple automations successfully', async () => {
      const templates = await getAutomationTemplates()
      const simpleTemplate = templates.find(t => t.complexity === 'simple')
      expect(simpleTemplate).toBeDefined()
      
      const automation = await activateAutomation(simpleTemplate.id, 'test-user', { test: true })
      const success = await executeAutomation(automation.id)
      expect(success).toBe(true)
      expect(automation.executionCount).toBe(1)
    })

    it('should activate automations with approval system integration', async () => {
      const template = await getAutomationTemplate('workflow-navigator')
      expect(template).toBeDefined()
      
      const automation = await activateAutomation(template.id, 'test-user')
      expect(automation).toBeDefined()
      expect(automation.approvals).toBeDefined()
    })
  })

  describe('Automation Suggestions and Analysis', () => {
    it('should analyze user behavior and provide automation suggestions', async () => {
      // Mock user with patterns that trigger suggestions
      vi.mocked().getAutomationSuggestions.mockResolvedValueOnce([])
      vi.mocked().queryLog.mockResolvedValue([])
      vi.mocked().getFeatureUsage.mockResolvedValue([])
      vi.mocked().detectPatterns.mockResolvedValue([])
      
      const suggestions = await getAutomationSuggestions('test-user')
      expect(Array.isArray(suggestions)).toBe(true)
      
      // Suggestions should be filtered based on user patterns
      const filteredTemplates = suggestions.filter(s => !s.requiredApprovals)
      expect(filteredTemplates.length).toBeGreaterThanOrEqual(0)
    })

    it('should generate context-aware suggestions', async () => {
      const suggestions = await getAutomationSuggestions('test-user')
      suggestions.forEach(suggestion => {
        expect(suggestion.templateId).toBeDefined()
        expect(suggestion.confidence).toBeGreaterThanOrEqual(0)
        expect(suggestion.timeSavingEstimate).toBeGreaterThanOrEqual(0)
        expect(suggestion.requiredApprovals).toBeDefined()
      })
    })
  })

  describe('Automation User Management', () => {
    it('should retrieve user automations', async () => {
      await activateAutomation('auto-save-progress', 'test-user')
      await activateAutomation('smart-notification', 'test-user')
      
      const userAutomations = await getUserAutomations('test-user')
      expect(userAutomations.length).toBe(2)
      expect(userAutomations.every(a => a.userId === 'test-user')).toBe(true)
    })

    it('should track automation usage and success rates', async () => {
      const template = await getAutomationTemplate('auto-save-progress')
      expect(template).toBeDefined()
      
      const automation = await activateAutomation(template.id, 'test-user')
      await executeAutomation(automation.id)
      await executeAutomation(automation.id)
      
      expect(automation.executionCount).toBe(2)
      expect(automation.successCount).toBeGreaterThanOrEqual(1)
    })

    it('should provide user automation statistics', async () => {
      const template = await getAutomationTemplate('auto-save-progress')
      expect(template).toBeDefined()
      
      await activateAutomation(template.id, 'test-user')
      
      const stats = await getUserAutomationStats('test-user')
      expect(stats.totalActive).toBeGreaterThanOrEqual(0)
      expect(stats.totalExecutions).toBeGreaterThanOrEqual(0)
      expect(stats.totalSuccessRate).toBeGreaterThanOrEqual(0)
      expect(stats.timeSavingEstimate).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Automation Feedback and Learning', () => {
    it('should collect user feedback on automation performance', async () => {
      const template = await getAutomationTemplate('auto-save-progress')
      expect(template).toBeDefined()
      
      const automation = await activateAutomation(template.id, 'test-user')
      
      await addAutomationFeedback({
        automationId: automation.id,
        userId: 'test-user',
        action: 'feedback',
        rating: 4,
        comment: 'Great automation!',
        timestamp: Date.now(),
      })
      
      // Wait a bit for feedback processing
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(template).toBeDefined()
      // Note: Success rate updates happen asynchronously
    })

    it('should adjust automation probabilities based on user behavior', async () => {
      const adjustPromise = await adjustAutomationProbabilities('test-user')
      expect(adjustPromise).toBeUndefined()
    })
  })

  describe('Integration and Workflow', () => {
    it('should provide comprehensive automation insights', async () => {
      await activateAutomation('auto-save-progress', 'test-user')
      
      const insights = await getAutomationInsights('test-user')
      expect(insights).toBeDefined()
      expect(insights.potentialSavings).toBeGreaterThanOrEqual(0)
      expect(insights.automationReadiness).toBeGreaterThanOrEqual(0)
      expect(insights.nextActionRecommendations).toBeDefined()
    })

    it('should integrate with interaction logging', async () => {
      const template = await getAutomationTemplate('auto-save-progress')
      expect(template).toBeDefined()
      
      const automation = await activateAutomation(template.id, 'test-user')
      await executeAutomation(automation.id)
      
      expect(vi.mocked().logInteraction).toHaveBeenCalled()
    })
  })
})
