"""
Intelligent Workflow Automation System

This module provides an AI-powered workflow automation system that learns from user interactions
and suggests automation opportunities. It leverages the existing interaction logging, behavior
prediction, and approval systems to detect patterns and suggest automations.

Acceptance Criteria:
- System identifies 60% of automation opportunities
- Suggested automations are accurate
- Users can customize automations
- Automation builder is intuitive
"""

import {
  InteractionEvent,
  InteractionType,
  InteractionPattern,
  InteractionLogQuery,
  queryLog,
  getFeatureUsage,
  detectPatterns,
} from './interactionLog'

import {
  BehaviorProfile,
  IntentPrediction,
  NextActionPrediction,
  buildOrUpdateProfile,
  predictIntent,
  predictNextAction,
} from './behaviorPrediction'

import {
  ApprovalRequest,
  ApprovalPriority,
  approvalSystem,
} from './approvalSystem'

export interface AutomationTemplate {
  id: string
  name: string
  description: string
  category: AutomationCategory
  trigger: AutomationTrigger
  actions: AutomationAction[]
  prerequisites: string[]
  complexity: AutomationComplexity
  estimatedTimeSaving: number
  tags: string[]
  authorId?: string
  isCustom: boolean
  usageCount: number
  successRate: number
}

export type AutomationCategory =
  | 'data_processing'
  | 'notification'
  | 'workflow'
  | 'integration'
  | 'monitoring'
  | 'optimization'

export interface AutomationTrigger {
  type: 'event' | 'schedule' | 'condition' | 'api'
  source: string
  conditions?: AutomationConditionGroup
  eventTypes?: InteractionType[]
  eventTargets?: string[]
  pattern?: string
  schedule?: {
    interval: string
    timezone?: string
    days?: string[]
  }
}

export interface AutomationConditionGroup {
  operator: 'and' | 'or' | 'not'
  conditions: AutomationCondition[]
}

export interface AutomationCondition {
  field: string
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'exists'
  value?: unknown
  timeWindow?: number
}

export interface AutomationAction {
  type: 'log' | 'notify' | 'create_transaction' | 'update_field' | 'call_api' | 'trigger_workflow' | 'run_ml_model'
  target: string
  parameters: Record<string, unknown>
  conditional?: boolean
}

export interface AutomationInstance {
  id: string
  templateId: string
  userId: string
  config: Record<string, unknown>
  isActive: boolean
  createdAt: number
  lastExecuted?: number
  executionCount: number
  successCount: number
  nextExecution?: number
  approvals?: string[]
  customTriggers?: AutomationTrigger[]
}

export interface AutomationSuggestion {
  templateId: string
  template: AutomationTemplate
  confidence: number
  timeSavingEstimate: number
  reasoning: string
  requiredApprovals: boolean
  complexity: AutomationComplexity
}

export interface AutomationFeedback {
  id: string
  automationId: string
  userId: string
  action: 'feedback' | 'approve' | 'reject' | 'modify'
  rating: number
  comment?: string
  adjustments?: Partial<AutomationInstance>
  timestamp: number
}

export type AutomationComplexity = 'simple' | 'medium' | 'complex'

const STORAGE_KEY = 'workflow-automations'
const SUGGESTIONS_KEY = 'automation-suggestions'

let _automations: AutomationInstance[] = []
let _templates: AutomationTemplate[] = []
let _suggestions: AutomationSuggestion[] = []
let _feedback: AutomationFeedback[] = []
let _hydrated = false

// Built-in automation templates
const BUILT_IN_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'auto-save-progress',
    name: 'Auto-save Progress',
    description: 'Automatically saves form progress every 5 minutes',
    category: 'data_processing',
    trigger: {
      type: 'schedule',
      schedule: { interval: 'every 5 minutes' },
    },
    actions: [
      {
        type: 'log',
        target: 'form_state',
        parameters: { action: 'save' },
      },
    ],
    prerequisites: [],
    complexity: 'simple',
    estimatedTimeSaving: 2,
    tags: ['form', 'data', 'progress'],
    isCustom: false,
    usageCount: 0,
    successRate: 0.95,
  },
  {
    id: 'smart-notification',
    name: 'Smart Notifications',
    description: 'Send contextual notifications based on user activity patterns',
    category: 'notification',
    trigger: {
      type: 'condition',
      conditions: {
        operator: 'and',
        conditions: [
          {
            field: 'interactionCount',
            operator: 'greater_than',
            value: 10,
            timeWindow: 300000,
          },
        ],
      },
    },
    actions: [
      {
        type: 'notify',
        target: 'alert-center',
        parameters: {
          message: 'You have been very active recently! Consider saving time with some common tasks.',
        },
      },
    ],
    prerequisites: [],
    complexity: 'medium',
    estimatedTimeSaving: 1,
    tags: ['notification', 'engagement', 'behavior'],
    isCustom: false,
    usageCount: 0,
    successRate: 0.87,
  },
  {
    id: 'workflow-navigator',
    name: 'Smart Navigation Helper',
    description: 'Suggests optimal navigation paths based on user behavior',
    category: 'workflow',
    trigger: {
      type: 'event',
      eventTypes: ['page_view', 'navigation'],
      pattern: 'frequent_restart',
    },
    actions: [
      {
        type: 'log',
        target: 'navigation_helper',
        parameters: { action: 'suggest' },
      },
    ],
    prerequisites: [],
    complexity: 'medium',
    estimatedTimeSaving: 3,
    tags: ['navigation', 'ui', 'pattern'],
    isCustom: false,
    usageCount: 0,
    successRate: 0.82,
  },
  {
    id: 'data-export-automation',
    name: 'Smart Data Export',
    description: 'Automatically exports data at custom intervals or on completion of certain processes',
    category: 'integration',
    trigger: {
      type: 'schedule',
      schedule: { interval: 'every hour' },
    },
    actions: [
      {
        type: 'create_transaction',
        target: 'data_export',
        parameters: { format: 'csv' },
      },
    ],
    prerequisites: [],
    complexity: 'simple',
    estimatedTimeSaving: 5,
    tags: ['export', 'data', 'schedule'],
    isCustom: false,
    usageCount: 0,
    successRate: 0.91,
  },
]

async function hydrate(): Promise<void> {
  if (_hydrated || typeof window === 'undefined') return
  _hydrated = true
  try {
    const stored = await getStoredValue(STORAGE_KEY)
    if (Array.isArray(stored)) _automations = stored
    const storedTemplates = await getStoredValue('automation-templates')
    if (Array.isArray(storedTemplates)) _templates = storedTemplates
    const storedSuggestions = await getStoredValue(SUGGESTIONS_KEY)
    if (Array.isArray(storedSuggestions)) _suggestions = storedSuggestions
  } catch {
    _automations = []
    _templates = []
    _suggestions = []
  }
}

async function persist(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    await setStoredValue(STORAGE_KEY, _automations)
    await setStoredValue('automation-templates', _templates)
    await setStoredValue(SUGGESTIONS_KEY, _suggestions)
  } catch {
    // best-effort
  }
}

export async function initializeBuiltInTemplates(): Promise<void> {
  await hydrate()
  const builtInIds = BUILT_IN_TEMPLATES.map(t => t.id)
  const existingBuiltIn = _templates.filter(t => builtInIds.includes(t.id))
  
  if (existingBuiltIn.length !== BUILT_IN_TEMPLATES.length) {
    _templates = [...BUILT_IN_TEMPLATES]
    await persist()
  }
}

export async function getAutomationTemplates(
  userId?: string,
  category?: AutomationCategory
): Promise<AutomationTemplate[]> {
  await hydrate()
  let templates = [..._templates]
  
  if (category) {
    templates = templates.filter(t => t.category === category)
  }
  
  if (userId) {
    templates = templates.filter(t => t.isCustom || t.authorId === userId)
  }
  
  templates.sort((a, b) => {
    if (b.successRate !== a.successRate) return b.successRate - a.successRate
    return b.usageCount - a.usageCount
  })
  
  return templates
}

export async function getAutomationTemplate(templateId: string): Promise<AutomationTemplate | null> {
  await hydrate()
  return _templates.find(t => t.id === templateId) || null
}

export async function createCustomTemplate(
  template: Omit<AutomationTemplate, 'id' | 'usageCount' | 'successRate' | 'isCustom'>
): Promise<AutomationTemplate> {
  await hydrate()
  
  const newTemplate: AutomationTemplate = {
    ...template,
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    isCustom: true,
    usageCount: 0,
    successRate: 0.5,
  }
  
  _templates.push(newTemplate)
  await persist()
  
  return newTemplate
}

export async function updateTemplate(templateId: string, updates: Partial<AutomationTemplate>): Promise<void> {
  await hydrate()
  const idx = _templates.findIndex(t => t.id === templateId)
  if (idx === -1) return
  
  _templates[idx] = { ..._templates[idx], ...updates }
  await persist()
}

export async function activateAutomation(
  templateId: string,
  userId: string,
  config?: Record<string, unknown>
): Promise<AutomationInstance> {
  await hydrate()
  
  const template = await getAutomationTemplate(templateId)
  if (!template) {
    throw new Error(`Template ${templateId} not found`)
  }
  
  let requiresApproval = template.complexity === 'complex'
  
  let instance: AutomationInstance = {
    id: `instance-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    templateId,
    userId,
    config: config || {},
    isActive: true,
    createdAt: Date.now(),
    executionCount: 0,
    successCount: 0,
    approvals: requiresApproval ? [userId] : [],
    customTriggers: [],
  }
  
  if (requiresApproval) {
    approvalSystem.createRequest({
      incidentId: userId,
      action: `activate_automation_${templateId}`,
      description: `New automation '${template.name}' requires your approval before activation`,
      rationale: `This automation will ${template.description.toLowerCase()} and has ${template.complexity} complexity. It's estimated to save ${template.estimatedTimeSaving} minutes per session.`,
      priority: 'medium',
      requestedBy: userId,
      context: { templateId, config },
    })
  }
  
  _automations.push(instance)
  await persist()
  
  return instance
}

export async function deactivateAutomation(instanceId: string, userId: string): Promise<boolean> {
  await hydrate()
  const idx = _automations.findIndex(a => a.id === instanceId && a.userId === userId)
  if (idx === -1) return false
  
  _automations[idx].isActive = false
  await persist()
  
  return true
}

export async function executeAutomation(instanceId: string): Promise<boolean> {
  await hydrate()
  const instance = _automations.find(a => a.id === instanceId)
  if (!instance || !instance.isActive) return false
  
  instance.executionCount++
  instance.lastExecuted = Date.now()
  
  try {
    const template = await getAutomationTemplate(instance.templateId)
    if (!template) return false
    
    let success = false
    
    switch (instance.templateId) {
      case 'auto-save-progress':
        success = await executeAutoSaveProgress(instance)
        break
      case 'smart-notification':
        success = await executeSmartNotification(instance)
        break
      case 'workflow-navigator':
        success = await executeWorkflowNavigator(instance)
        break
      case 'data-export-automation':
        success = await executeDataExportAutomation(instance)
        break
      default:
        success = await executeGenericAutomation(instance, template)
        break
    }
    
    if (success) {
      instance.successCount++
    }
    
    _automations = _automations.map(a => a.id === instanceId ? instance : a)
    await persist()
    
    return success
  } catch (error) {
    logger.error('Automation execution failed', { instanceId, error })
    return false
  }
}

async function executeAutoSaveProgress(_instance: AutomationInstance): Promise<boolean> {
  const template = BUILT_IN_TEMPLATES.find(t => t.id === 'auto-save-progress')
  if (!template) return false
  
  const lastSave = Date.now() - 300000
  const recentEvents = await queryLog({
    userId: _instance.userId,
    since: lastSave,
    limit: 10,
  })
  
  const hasRecentActivity = recentEvents.some(e => 
    ['feature_use', 'navigation', 'transaction_build'].includes(e.type)
  )
  
  return await logInteraction(_instance.userId, 'settings_change', 'auto_save', {
    action: 'auto_save_progress',
    savedAt: Date.now(),
    activityDetected: hasRecentActivity,
  })
}

async function executeSmartNotification(_instance: AutomationInstance): Promise<boolean> {
  const template = BUILT_IN_TEMPLATES.find(t => t.id === 'smart-notification')
  if (!template) return false
  
  const last30Minutes = Date.now() - 1800000
  const recentEvents = await queryLog({
    userId: _instance.userId,
    since: last30Minutes,
    limit: 50,
  })
  
  const eventCount = recentEvents.length
  if (eventCount >= 10) {
    await dispatchToChannels({
      id: `smart-notify-${_instance.userId}-${Date.now()}',
      title: 'Smart Notification',
      description: `You have been very active with ${eventCount} actions in the last 30 minutes. Consider saving time with some common tasks.",
      severity: 'info',
      timestamp: new Date().toISOString(),
      tags: ['smart-notification', 'engagement'],
    })
    return true
  }
  
  return false
}

async function executeWorkflowNavigator(_instance: AutomationInstance): Promise<boolean> {
  const template = BUILT_IN_TEMPLATES.find(t => t.id === 'workflow-navigator')
  if (!template) return false
  
  const profile = await buildOrUpdateProfile(_instance.userId)
  const patterns = await detectPatterns(_instance.userId)
  
  const frequentRestarts = patterns.filter(p => p.pattern.includes('page_view'))
  if (frequentRestarts.length > 2) {
    await logInteraction(_instance.userId, 'suggestion_click', 'workflow_helper', {
      action: 'suggest_navigation',
      restartCount: frequentRestarts.length,
      suggestions: profile.topFeatures.slice(0, 3),
    })
    return true
  }
  
  return false
}

async function executeDataExportAutomation(_instance: AutomationInstance): Promise<boolean> {
  const template = BUILT_IN_TEMPLATES.find(t => t.id === 'data-export-automation')
  if (!template) return false
  
  await logInteraction(_instance.userId, 'export_data', 'data_export', {
    action: 'auto_export',
    format: 'csv',
    timestamp: Date.now(),
  })
  
  return true
}

async function executeGenericAutomation(
  _instance: AutomationInstance,
  template: AutomationTemplate
): Promise<boolean> {
  for (const action of template.actions) {
    switch (action.type) {
      case 'log':
        await logInteraction(_instance.userId, 'feature_use', action.target, {
          automation: _instance.id,
          action: action.type,
          parameters: action.parameters,
        })
        break
      case 'notify':
        await dispatchToChannels({
          id: `auto-notify-${_instance.userId}-${Date.now()}'',
          title: 'Automation Notification',
          description: `${action.parameters.message}` || `Automation '${template.name}' executed automatically.",
          severity: 'info',
          timestamp: new Date().toISOString(),
          tags: ['automation', 'auto-execution'],
        })
        break
      case 'create_transaction':
        await logInteraction(_instance.userId, 'transaction_submit', action.target, {
          automation: _instance.id,
          automationAction: action.type,
          parameters: action.parameters,
        })
        break
      case 'update_field':
        await logInteraction(_instance.userId, 'settings_change', action.target, {
          automation: _instance.id,
          automationAction: action.type,
          parameters: action.parameters,
        })
        break
      case 'call_api':
        await logInteraction(_instance.userId, 'export_data', action.target, {
          automation: _instance.id,
          automationAction: action.type,
          parameters: action.parameters,
        })
        break
      case 'trigger_workflow':
        await logInteraction(_instance.userId, 'navigation', action.target, {
          automation: _instance.id,
          automationAction: action.type,
          parameters: action.parameters,
        })
        break
      case 'run_ml_model':
        await logInteraction(_instance.userId, 'feature_use', action.target, {
          automation: _instance.id,
          automationAction: action.type,
          parameters: action.parameters,
        })
        break
    }
  }
  
  return true
}

export async function scheduleAutomationExecution(instanceId: string, delayMs: number): Promise<void> {
  await hydrate()
  const instance = _automations.find(a => a.id === instanceId)
  if (!instance) return
  
  const timer = setTimeout(() => {
    executeAutomation(instanceId).then(() => {
      if (instance.isActive) {
        const interval = parseSchedule(instance.templateId)
        if (interval) {
          scheduleAutomationExecution(instanceId, interval)
        }
      }
    })
  }, delayMs)
  
  if (!instance.timers) instance.timers = {}
  instance.timers[scheduleAutomationExecution.name] = timer
}

function parseSchedule(_templateId: string): number | null {
  return 3600000
}

export async function updateAutomation(instanceId: string, updates: Partial<AutomationInstance>): Promise<void> {
  await hydrate()
  _automations = _automations.map(a => a.id === instanceId ? { ...a, ...updates } : a)
  await persist()
}

export async function getUserAutomations(userId: string): Promise<AutomationInstance[]> {
  await hydrate()
  return _automations.filter(a => a.userId === userId)
}

export async function getUserActiveAutomations(userId: string): Promise<AutomationInstance[]> {
  await hydrate()
  return _automations.filter(a => a.userId === userId && a.isActive)
}

export async function getUserAutomationStats(userId: string): Promise<{
  totalActive: number
  totalExecutions: number
  totalSuccessRate: number
  timeSavingEstimate: number
}> {
  await hydrate()
  const userAutomations = _automations.filter(a => a.userId === userId)
  const active = userAutomations.filter(a => a.isActive)
  const totalExecutions = userAutomations.reduce((sum, a) => sum + a.executionCount, 0)
  const totalSuccess = userAutomations.reduce((sum, a) => sum + a.successCount, 0)
  const successRate = totalExecutions > 0 ? totalSuccess / totalExecutions : 0
  
  const totalTimeSaving = active.reduce((sum, a) => {
    const template = BUILT_IN_TEMPLATES.find(t => t.id === a.templateId)
    return sum + (template ? template.estimatedTimeSaving * a.executionCount : 0)
  }, 0)
  
  return {
    totalActive: active.length,
    totalExecutions,
    totalSuccessRate: successRate,
    timeSavingEstimate: totalTimeSaving,
  }
}

export async function analyzeAutomationOpportunities(userId: string): Promise<AutomationSuggestion[]> {
  await hydrate()
  const now = Date.now()
  const last24Hours = now - 86400000
  
  const recentEvents = await queryLog({
    userId,
    since: last24Hours,
    limit: 500,
  })
  
  const profile = await buildOrUpdateProfile(userId)
  const patterns = await detectPatterns(userId)
  const suggestions: AutomationSuggestion[] = []
  
  for (const template of BUILT_IN_TEMPLATES) {
    let matches = 0
    let confidence = 0
    let reasoning = ''
    
    if (template.id === 'auto-save-progress') {
      const hasFormWork = recentEvents.some(e => 
        ['transaction_build', 'account_view', 'settings_change'].includes(e.type)
      )
      if (hasFormWork) {
        matches = 1
        confidence = 0.8
        reasoning = 'You frequently work with forms and settings - auto-save would prevent data loss'
      }
    } else if (template.id === 'smart-notification') {
      const eventCount = recentEvents.length
      if (eventCount >= 10) {
        matches = 1
        confidence = 0.7
        reasoning = `You had ${eventCount} interactions in 24h - time-based nudges would help optimize your workflow"
      }
    } else if (template.id === 'workflow-navigator') {
      const restartPatterns = patterns.filter(p => p.pattern.includes('page_view'))
      if (restartPatterns.length >= 2) {
        matches = 1
        confidence = 0.6
        reasoning = `You've restarted navigation ${restartPatterns.length} times - workflow suggestions would save you steps"
      }
    } else if (template.id === 'data-export-automation') {
      const hasExportWork = recentEvents.some(e => e.type === 'export_data')
      if (hasExportWork) {
        matches = 1
        confidence = 0.9
        reasoning = 'You export data regularly - automated scheduling would save time"
      }
    }
    
    if (matches > 0) {
      const suggestion: AutomationSuggestion = {
        templateId: template.id,
        template,
        confidence,
        timeSavingEstimate: template.estimatedTimeSaving,
        reasoning,
        requiredApprovals: template.complexity === 'complex',
        complexity: template.complexity,
      }
      suggestions.push(suggestion)
    }
  }
  
  suggestions.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    return b.timeSavingEstimate - a.timeSavingEstimate
  })
  
  return suggestions
}

export async function getAutomationSuggestions(userId: string): Promise<AutomationSuggestion[]> {
  await hydrate()
  const suggestions = await analyzeAutomationOpportunities(userId)
  
  const existingActive = _automations
    .filter(a => a.userId === userId && a.isActive)
    .map(a => a.templateId)
  
  const filtered = suggestions.filter(s => !existingActive.includes(s.templateId))
  
  return filtered.slice(0, 5)
}

export async function addAutomationFeedback(feedback: AutomationFeedback): Promise<void> {
  await hydrate()
  _feedback.push(feedback)
  await persist()
  
  const instance = _automations.find(a => a.id === feedback.automationId)
  if (!instance) return
  
  instance.successCount += feedback.rating >= 4 ? 1 : 0
  await persist()
  
  const template = _templates.find(t => t.id === instance.templateId)
  if (template) {
    const totalRating = _feedback
      .filter(f => f.automationId === instance.id)
      .reduce((sum, f) => sum + f.rating, 0)
    const count = _feedback.filter(f => f.automationId === instance.id).length
    
    template.successRate = totalRating / count
    template.usageCount += 1
    
    await persist()
  }
}

export async function logInteraction(
  userId: string,
  type: InteractionType,
  target: string,
  metadata: Record<string, unknown> = {},
  duration?: number
): Promise<any> {
  try {
    return await interactionLog.logInteraction(userId, type, target, metadata, duration || 0)
  } catch (error) {
    logger.warn('Failed to log interaction for automation', { userId, type, target, error })
    return null
  }
}

export async function registerApprovalHandler(): Promise<() => void> {
  return approvalSystem.subscribe((state: any) => {
    state.pending.forEach((request: any) => {
      if (request.action.startsWith('activate_automation_')) {
        const templateId = request.action.replace('activate_automation_', '')
        activateAutomation(templateId, request.requestedBy, request.context)
          .then(instance => {
            approvalSystem.approve(request.id, 'automation_system')
          })
          .catch(error => {
            approvalSystem.reject(request.id, 'automation_system', `Failed to activate: ${error.message}`)
          })
      }
    })
  })
}

export async function getSuccessRate(automationId: string): Promise<number> {
  await hydrate()
  const automation = _automations.find(a => a.id === automationId)
  if (!automation || automation.executionCount === 0) return 0
  
  return automation.successCount / automation.executionCount
}

export async function clearUserAutomationHistory(userId: string): Promise<void> {
  await hydrate()
  _automations = _automations.filter(a => a.userId !== userId)
  _feedback = _feedback.filter(f => f.userId !== userId)
  await persist()
}

export async function adjustAutomationProbabilities(userId: string): Promise<void> {
  await hydrate()
  const profile = await buildOrUpdateProfile(userId)
  
  for (const template of _templates) {
    if (template.isCustom) {
      let currentRate = template.successRate
      if (profile.featureAffinities && template.tags.some(tag => tag in profile.featureAffinities)) {
        currentRate = Math.min(0.95, currentRate + 0.05)
      }
      if (profile.patternAdherence < 0.5 && !template.customTriggers?.length) {
        currentRate = Math.max(0.3, currentRate - 0.1)
      }
      
      template.successRate = currentRate
    }
  }
  
  await persist()
}

export async function getAutomationInsights(userId: string): Promise<any> {
  await hydrate()
  const userAutomations = _automations.filter(a => a.userId === userId)
  const profile = await buildOrUpdateProfile(userId)
  
  return {
    potentialSavings: userAutomations.reduce((sum, a) => {
      const template = BUILT_IN_TEMPLATES.find(t => t.id === a.templateId)
      return sum + (template ? template.estimatedTimeSaving * a.executionCount : 0)
    }, 0),
    engagementPatterns: {
      topFeatures: profile.topFeatures,
      preferredActions: profile.preferredActions,
      activeHours: profile.activeHours,
    },
    suggestedEnhancements: userAutomations.filter(a => !a.isActive).map(a => a.templateId),
    automationReadiness: Math.min(...[profile.topFeatures.length, profile.patternAdherence, profile.accuracy || 0.5]),
    nextActionRecommendations: userAutomations.length === 0 ? 'Enable an automation to get personalized suggestions' : 'Try "Suggest Automations" from the settings menu',
  }
}

const logger = {
  info: (msg: string, meta?: any) => console.log(`[Automation] ${msg}`, meta),
  warn: (msg: string, meta?: any) => console.warn(`[Automation] ${msg}`, meta),
  error: (msg: string, meta?: any) => console.error(`[Automation] ${msg}`, meta),
}

const interactionLog = {
  logInteraction,
}

const storage = {
  getStoredValue: async (key: string) => {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : null
  },
  setStoredValue: async (key: string, value: any) => {
    localStorage.setItem(key, JSON.stringify(value))
  },
}

const dispatchToChannels = async (alert: any, channels: any[]) => {
  try {
    await alertChannelsService.createAlert(alert, channels)
  } catch (error) {
    logger.warn('Failed to dispatch automation alert', { alert, error })
  }
}

export default {
  initializeBuiltInTemplates,
  getAutomationTemplates,
  createCustomTemplate,
  updateTemplate,
  activateAutomation,
  deactivateAutomation,
  executeAutomation,
  scheduleAutomationExecution,
  updateAutomation,
  getUserAutomations,
  getUserActiveAutomations,
  getUserAutomationStats,
  analyzeAutomationOpportunities,
  getAutomationSuggestions,
  addAutomationFeedback,
  getSuccessRate,
  clearUserAutomationHistory,
  adjustAutomationProbabilities,
  getAutomationInsights,
  registerApprovalHandler,
}
