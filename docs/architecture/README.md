# RAG/FileSearch Caching Architecture - Documentation Index

## Overview

This directory contains comprehensive architecture documentation for the **Multi-Layer RAG Caching System** designed to optimize Gemini FileSearch response times from 20 seconds to under 5 seconds.

---

## 📋 Documents

### 1. [rag-caching-architecture.md](./rag-caching-architecture.md)

**Main Architecture Design Document**

Complete technical specification including:
- Current system analysis
- Three-layer cache architecture (L1/L2/L3)
- Component design (InMemory, Redis, Firestore)
- Semantic similarity strategy
- Implementation plan with milestones
- Cost analysis and ROI calculations
- Security considerations
- Monitoring and observability

**Read this first** for understanding the overall architecture.

---

### 2. [cache-flow-diagrams.md](./cache-flow-diagrams.md)

**Visual Flow Diagrams**

Detailed request flows including:
- Cache hit scenarios (L1/L2/L3)
- Cold start flow (FileSearch API)
- Cache invalidation flows
- Semantic similarity search process
- Cache warming and background refresh
- Error handling and fallback strategies

**Read this** to understand how data flows through the system.

---

### 3. [implementation-guide.md](./implementation-guide.md)

**Step-by-Step Implementation Guide**

Practical implementation instructions:
- Phase 1: L1 Cache Enhancement (Week 1-2)
- Phase 2: L2 Semantic Cache (Week 1-2)
- Phase 3: L3 Persistent Cache (Week 3)
- Code examples and integration points
- Testing strategies
- Deployment checklist

**Use this** as your implementation roadmap.

---

### 4. [adr-cache-architecture.md](./adr-cache-architecture.md)

**Architecture Decision Record**

Decision rationale and trade-offs:
- Technology selection justifications
- Alternative solutions considered (and why rejected)
- Risk assessment and mitigation strategies
- Success criteria and monitoring
- Rollback plan
- Future considerations

**Refer to this** when questions arise about "why we chose X over Y".

---

## 🎯 Quick Start

### For Developers

1. **Understand the architecture**: Read [rag-caching-architecture.md](./rag-caching-architecture.md)
2. **Review data flows**: Study [cache-flow-diagrams.md](./cache-flow-diagrams.md)
3. **Start implementing**: Follow [implementation-guide.md](./implementation-guide.md)
4. **Reference decisions**: Check [adr-cache-architecture.md](./adr-cache-architecture.md) for context

### For Architects

1. **Architecture overview**: [rag-caching-architecture.md](./rag-caching-architecture.md) Section 2
2. **Decision rationale**: [adr-cache-architecture.md](./adr-cache-architecture.md)
3. **Technology evaluation**: [adr-cache-architecture.md](./adr-cache-architecture.md) "Technology Choices"
4. **Cost analysis**: [rag-caching-architecture.md](./rag-caching-architecture.md) Section 7

### For Product Managers

1. **Business case**: [rag-caching-architecture.md](./rag-caching-architecture.md) Section 1.2
2. **Expected outcomes**: [adr-cache-architecture.md](./adr-cache-architecture.md) "Success Criteria"
3. **Timeline**: [implementation-guide.md](./implementation-guide.md) deployment checklist
4. **Cost savings**: [rag-caching-architecture.md](./rag-caching-architecture.md) Section 7.2

---

## 🔑 Key Concepts

### Multi-Layer Caching

The architecture uses **three cache layers** working together:

```
┌─────────────────────────────────────────────────────┐
│  Request Flow (Fastest to Slowest)                  │
├─────────────────────────────────────────────────────┤
│                                                      │
│  L1: InMemory (Node.js)                             │
│  ├─ Exact query matching                            │
│  ├─ Latency: <1ms                                   │
│  └─ Hit rate: 15-25%                                │
│                                                      │
│  L2: Redis (Cloud Memorystore)                      │
│  ├─ Semantic similarity search                      │
│  ├─ Latency: 5-10ms                                 │
│  └─ Hit rate: 40-60%                                │
│                                                      │
│  L3: Firestore (Persistent)                         │
│  ├─ Long-term storage + analytics                   │
│  ├─ Latency: 50-100ms                               │
│  └─ Hit rate: 10-15%                                │
│                                                      │
│  FileSearch API (Cold Start)                        │
│  ├─ Original Gemini API                             │
│  ├─ Latency: 15-20s                                 │
│  └─ Hit rate: 5-10% (only for new queries)         │
│                                                      │
└─────────────────────────────────────────────────────┘

Overall Cache Hit Rate: 90-95%
Average Response Time: <1s (vs 20s current)
```

---

### Semantic Similarity

**Problem**: User queries vary in phrasing but have the same intent.

**Example**:
- "新人研修のスケジュール" (New hire training schedule)
- "新入社員の研修予定" (New employee training plan)
- "研修プログラムの日程" (Training program dates)

**Solution**: Use **vector embeddings** to find semantically similar queries:

1. Convert query to 768-dimensional vector (Google text-embedding-005)
2. Search Redis for similar vectors using HNSW algorithm
3. Return cached result if similarity > 0.92

**Benefit**: ~60% cache hit rate improvement vs exact matching

---

### Cache Warming

**Problem**: Cold start after server restart causes slow responses.

**Solution**: Proactively pre-populate cache with popular queries:

1. **Startup Warming**: Load top 100 popular queries from Firestore into Redis
2. **Background Refresh**: Re-generate expiring cache entries before they expire
3. **Analytics-Driven**: Prioritize queries with high access frequency

**Benefit**: Eliminates cold start for 80%+ of queries

---

## 📊 Expected Performance

### Before (Current System)

| Metric | Value |
|--------|-------|
| Average Response Time | 20s |
| P99 Latency | 25s |
| Cache Hit Rate | 0% |
| Monthly API Cost | $500 |
| User Satisfaction | ⭐⭐ |

### After (With Caching)

| Metric | Value |
|--------|-------|
| Average Response Time | <1s (95% cases) |
| P99 Latency | <5s |
| Cache Hit Rate | 90-95% |
| Monthly Total Cost | $305 ($25 API + $280 infra) |
| User Satisfaction | ⭐⭐⭐⭐⭐ |

### Improvement

- **95% reduction** in average response time
- **80% reduction** in P99 latency
- **39% reduction** in total costs
- **∞% improvement** in cache hit rate (0% → 95%)

---

## 🏗️ Implementation Timeline

### Phase 1: Foundation (Week 1-2)

**Goal**: L1 + L2 operational

- [ ] Extend InMemoryCacheService with FileSearch support
- [ ] Setup Cloud Memorystore (Redis)
- [ ] Implement SemanticCacheService
- [ ] Integrate with HybridRagAssistant
- [ ] Unit + integration tests

**Deliverable**: 70-80% cache hit rate

---

### Phase 2: Persistence (Week 3)

**Goal**: L3 + Analytics

- [ ] Setup Cloud Firestore collections
- [ ] Implement PersistentCacheService
- [ ] Build analytics dashboard
- [ ] L1↔L2↔L3 full integration

**Deliverable**: 85-90% cache hit rate

---

### Phase 3: Optimization (Week 4)

**Goal**: Production-ready

- [ ] Cache warming service
- [ ] Cache invalidation logic
- [ ] Monitoring and alerts
- [ ] Load testing (1000 req/min)
- [ ] Production deployment

**Deliverable**: 90-95% cache hit rate, <5s P99 latency

---

## 💰 Cost Breakdown

### Infrastructure Costs

| Service | Specification | Monthly Cost |
|---------|--------------|--------------|
| **Cloud Memorystore** | Redis M1 (4GB), HA, RediSearch | $150-200 |
| **Cloud Firestore** | 10M reads, 1M writes | $10-20 |
| **Text Embedding API** | 1M queries/month | $20-40 |
| **Cloud Monitoring** | Logs + Metrics | $10-20 |
| **Total Infrastructure** | | **$190-280** |

### API Cost Savings

| Scenario | Monthly Cost |
|----------|--------------|
| **Current** (10,000 FileSearch calls) | $500 |
| **With Cache** (500 calls, 95% hit rate) | $25 |
| **Savings** | **$475** |

### Net Cost Analysis

```
Monthly Costs:
  Infrastructure: $280
  API (cached):   $25
  Total:          $305

Monthly Savings:
  API reduction:  $475
  Net benefit:    $195/month

ROI: 39% total cost reduction
Plus: Massive UX improvement (20s → <1s)
```

---

## 🔐 Security

### Data Protection

| Layer | Security Measure | Status |
|-------|------------------|--------|
| **L1 (InMemory)** | Process isolation | ✅ Default |
| **L2 (Redis)** | VPC isolation + TLS | ✅ Managed |
| **L3 (Firestore)** | IAM + Security Rules | ✅ Configured |
| **Embeddings** | API key rotation | ✅ Required |

### Cache Validation

```typescript
// All cache entries validated before storage
validateCacheEntry(result: FileSearchAnswerResult): boolean {
  // Schema validation
  if (!result.answer || !result.message) return false;

  // Content security (XSS prevention)
  const suspiciousPatterns = [/<script>/i, /javascript:/i];
  if (suspiciousPatterns.some(p => p.test(result.answer))) {
    return false;
  }

  return true;
}
```

---

## 📈 Monitoring

### Key Metrics Dashboard

```
┌──────────────────────────────────────────────────┐
│           Cache Performance (Last 24h)           │
├──────────────────────────────────────────────────┤
│                                                   │
│  Cache Hit Rate:  ████████████████░░ 92%         │
│  L1 Hits:        ████░░░░░░░░░░░░░░ 18%         │
│  L2 Hits:        ████████████░░░░░░ 58%         │
│  L3 Hits:        ███░░░░░░░░░░░░░░░ 16%         │
│                                                   │
│  Avg Latency:    12ms (target: <100ms) ✅        │
│  P95 Latency:    85ms (target: <500ms) ✅        │
│  P99 Latency:    3.2s (target: <5s) ✅          │
│                                                   │
│  API Cost Today: $0.83 (vs $16.67 without cache) │
│                                                   │
└──────────────────────────────────────────────────┘
```

### Alerts

| Alert | Trigger | Severity | Action |
|-------|---------|----------|--------|
| Low Cache Hit Rate | <80% for 1h | WARNING | Investigate query patterns |
| High L2 Latency | >20ms (P95) | WARNING | Check Redis health |
| FileSearch API Errors | >5% error rate | CRITICAL | Check Gemini status |
| Redis Memory High | >85% usage | WARNING | Scale Redis instance |

---

## 🚀 Deployment

### Feature Flags

```bash
# Progressive rollout using feature flags

# Stage 1: L1 only
export ENABLE_L1_FILE_SEARCH=true
export ENABLE_L2_SEMANTIC=false
export ENABLE_L3_PERSISTENT=false

# Stage 2: L1 + L2
export ENABLE_L2_SEMANTIC=true

# Stage 3: Full system
export ENABLE_L3_PERSISTENT=true
export ENABLE_CACHE_WARMING=true
```

### Rollback Plan

```bash
# Emergency rollback (if issues detected)

# Level 1: Disable newest layer
export ENABLE_L3_PERSISTENT=false  # Disable L3 only

# Level 2: Disable semantic cache
export ENABLE_L2_SEMANTIC=false    # Disable L2

# Level 3: Full rollback
git revert <commit-hash>           # Revert all changes
```

---

## 🤝 Contributing

### Code Reviews

All cache-related code must be reviewed by:
1. Backend Engineer (code quality)
2. System Architect (architecture alignment)
3. DevOps Engineer (operational feasibility)

### Testing Requirements

- [ ] Unit tests (>80% coverage)
- [ ] Integration tests (L1↔L2↔L3 flow)
- [ ] Load tests (1000 concurrent requests)
- [ ] Manual QA (answer quality verification)

---

## 📞 Support

### Questions?

- **Architecture Questions**: Contact System Architecture Team
- **Implementation Help**: Check [implementation-guide.md](./implementation-guide.md)
- **Troubleshooting**: See [cache-flow-diagrams.md](./cache-flow-diagrams.md) error handling section
- **Cost Concerns**: Review [rag-caching-architecture.md](./rag-caching-architecture.md) Section 7

### Feedback

Please submit feedback or suggestions via:
- GitHub Issues (internal repo)
- Slack: #retention-engine-dev
- Email: architecture-team@example.com

---

## 📚 Additional Resources

### External Documentation

- [Google Cloud Memorystore](https://cloud.google.com/memorystore)
- [RediSearch Vector Similarity](https://redis.io/docs/stack/search/reference/vectors/)
- [Google Text Embeddings](https://cloud.google.com/vertex-ai/docs/generative-ai/embeddings/get-text-embeddings)
- [Cloud Firestore Best Practices](https://cloud.google.com/firestore/docs/best-practices)

### Related Projects

- [Gemini FileSearch Documentation](https://ai.google.dev/gemini-api/docs/file-search)
- [HNSW Algorithm](https://arxiv.org/abs/1603.09320)
- [Semantic Caching Patterns](https://redis.io/docs/stack/search/reference/vectors/)

---

## 📝 Changelog

### Version 1.0 (2025-12-19)

- ✅ Initial architecture design
- ✅ Three-layer cache specification
- ✅ Semantic similarity strategy
- ✅ Implementation guide
- ✅ ADR documentation
- ✅ Flow diagrams

### Future Versions

- [ ] v1.1: Production deployment results
- [ ] v1.2: Performance tuning insights
- [ ] v1.3: Multi-region support
- [ ] v2.0: ML-based cache warming

---

**Last Updated**: 2025-12-19
**Document Owner**: System Architecture Team
**Status**: Approved for Implementation
**Next Review**: 2026-01-19 (30 days post-deployment)
