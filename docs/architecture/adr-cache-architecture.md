# Architecture Decision Record: RAG Cache Architecture

## ADR-001: Multi-Layer Caching Strategy

**Status**: Approved
**Date**: 2025-12-19
**Decision Makers**: System Architecture Team

---

## Context

Current Gemini FileSearch API response time averages 15-20 seconds, causing poor user experience. The system needs to reduce response time to under 5 seconds while maintaining answer quality and minimizing costs.

### Current System Metrics

| Metric | Current Value | Target Value |
|--------|--------------|--------------|
| Average Response Time | 20s | <5s |
| P99 Latency | 25s | <5s |
| Cache Hit Rate | 0% | >90% |
| Monthly API Cost | $500 | <$100 |

### Requirements

1. **Performance**: 90-95% of requests must respond in <5 seconds
2. **Quality**: Maintain answer accuracy and relevance
3. **Cost**: Reduce Gemini API costs by 80%+
4. **Scalability**: Support 1000+ concurrent users
5. **Google Cloud**: Prioritize Google Cloud services

---

## Decision

Implement a **three-layer caching architecture** with semantic similarity matching:

1. **L1 (InMemory)**: Exact query matching (<1ms)
2. **L2 (Redis/Memorystore)**: Semantic similarity search (5-10ms)
3. **L3 (Firestore)**: Long-term storage and analytics (50-100ms)

### Cache Flow

```
Request → L1 (exact) → L2 (semantic) → L3 (persistent) → FileSearch API
           <1ms         5-10ms           50-100ms          15-20s
```

---

## Considered Alternatives

### Alternative 1: Single-Layer Redis Cache

**Pros**:
- Simple implementation
- Fast response (<10ms)
- Mature technology

**Cons**:
- ❌ No semantic matching (requires exact query match)
- ❌ Cold start on server restart
- ❌ Higher Redis costs (all queries in memory)

**Decision**: Rejected - lacks semantic intelligence

---

### Alternative 2: PostgreSQL with pgvector

**Pros**:
- Relational data model
- ACID compliance
- Vector similarity support via pgvector

**Cons**:
- ❌ Slower than Redis (50-200ms for vector search)
- ❌ Requires Cloud SQL management
- ❌ Not Google's primary recommendation

**Decision**: Rejected - latency too high for L2 cache

---

### Alternative 3: Vertex AI Matching Engine

**Pros**:
- Google Cloud native
- Purpose-built for vector similarity
- Auto-scaling

**Cons**:
- ❌ Higher cost ($100+/month minimum)
- ❌ Complex setup
- ❌ Overkill for moderate traffic

**Decision**: Rejected - cost not justified for current scale

---

### Alternative 4: Simple LRU Cache (In-Memory Only)

**Pros**:
- Zero infrastructure cost
- Sub-millisecond latency
- Easy implementation

**Cons**:
- ❌ Lost on server restart
- ❌ No semantic matching
- ❌ Memory limitations
- ❌ No analytics

**Decision**: Rejected - insufficient for production

---

## Technology Choices

### L1: Enhanced InMemoryCacheService (Node.js Map)

**Why Chosen**:
- ✅ Already exists in codebase
- ✅ Sub-millisecond latency
- ✅ Zero external dependencies
- ✅ Mutex lock prevents cache stampede

**Trade-offs**:
- ⚠️ Volatile (lost on restart)
- ⚠️ Single-instance only (no clustering)

**Mitigation**: L2/L3 provide durability; L1 serves as hot cache only

---

### L2: Cloud Memorystore (Redis) with RediSearch

**Why Chosen**:
- ✅ Google Cloud native (fully managed)
- ✅ RediSearch module for vector similarity (HNSW)
- ✅ Sub-10ms latency for semantic search
- ✅ High availability + auto-failover
- ✅ No server management

**Alternative Considered**: Self-managed Redis on GCE
- ❌ Rejected: Requires ops maintenance

**Configuration**:
```
Instance: M1 (4GB memory)
Redis Version: 7.0
Modules: RediSearch
Estimated Cost: $150-200/month
```

**Trade-offs**:
- ⚠️ Cost (managed service premium)
- ⚠️ VPC dependency

**Mitigation**: Cost justified by labor savings; VPC already in use

---

### L3: Cloud Firestore

**Why Chosen**:
- ✅ Google Cloud native (serverless)
- ✅ Low cost ($10-20/month)
- ✅ Auto-scaling (no provisioning)
- ✅ Built-in analytics capabilities
- ✅ TTL-based auto-cleanup

**Alternative Considered**: Cloud Storage (GCS)
- ❌ Rejected: No query capabilities, manual TTL management

**Alternative Considered**: BigQuery
- ❌ Rejected: Overkill for operational cache, higher cost

**Trade-offs**:
- ⚠️ Slower than Redis (50-100ms reads)
- ⚠️ Not ideal for hot queries

**Mitigation**: L3 is cold storage; hot queries promoted to L2/L1

---

### Embeddings: Google text-embedding-005

**Why Chosen**:
- ✅ Google Cloud native
- ✅ 768 dimensions (good balance)
- ✅ Multilingual (Japanese support)
- ✅ Cost-effective ($0.025/1M tokens)

**Alternative Considered**: OpenAI text-embedding-3-large
- ❌ Rejected: External dependency, higher cost

**Alternative Considered**: Vertex AI Embeddings
- ⚠️ Considered but text-embedding-005 is simpler

**Configuration**:
```
Model: text-embedding-005
Dimensions: 768
Cost: ~$20-40/month (1M queries)
```

---

## Semantic Similarity Strategy

### Similarity Threshold: 0.92

**Rationale**:
```
Threshold = 0.92 chosen based on:
- 0.95+: Too strict (misses valid similar queries)
- 0.90-0.92: Sweet spot (good precision/recall)
- <0.90: Too loose (irrelevant matches)
```

**Examples**:

| Query 1 | Query 2 | Similarity | Match? |
|---------|---------|-----------|--------|
| "新人研修のスケジュール" | "新入社員の研修予定" | 0.95 | ✅ YES |
| "福利厚生について" | "社員の福利厚生制度" | 0.93 | ✅ YES |
| "有給休暇の取り方" | "年次有給休暇の申請" | 0.94 | ✅ YES |
| "新人研修のスケジュール" | "今日の天気" | 0.21 | ❌ NO |

**Tuning**: Threshold adjustable via environment variable

---

## Cache Key Design

### Key Structure

```typescript
cacheKey = hash(
  query.trim().toLowerCase() +
  conversationId +
  hash(systemInstruction)
)
```

**Components**:
1. **Query**: Normalized (trim + lowercase) for consistency
2. **ConversationId**: Isolates per-conversation context
3. **SystemInstruction Hash**: Includes PersonalityPreset + MBTI

**Rationale**:
- ✅ Same query + different preset = different cache entry (correct)
- ✅ Same query + same conversation = cache hit (correct)
- ✅ Collision probability < 0.001% (SHA-256 equivalent)

---

## Cache Invalidation Strategy

### Invalidation Triggers

| Trigger | Action | Scope | Latency |
|---------|--------|-------|---------|
| **Document Upload** | Clear all FileSearch cache | Global | <100ms |
| **User Settings Change** | Clear user-specific cache | Per-user | <10ms |
| **Manual Admin Action** | Clear specific query | Targeted | <1ms |
| **TTL Expiry** | Auto-delete expired entries | Automatic | Background |

### Implementation: Write-Through vs Write-Back

**Write-Through** (Cold Start):
```
FileSearch API → Write to L3 → Write to L2 → Write to L1
                  (async)      (async)      (sync)
```

**Write-Back** (Cache Promotion):
```
L2 Hit → Promote to L1 (sync)
L3 Hit → Promote to L2 (async) → Promote to L1 (sync)
```

**Rationale**: Balance consistency (write-through for cold) and performance (write-back for hot)

---

## TTL (Time-To-Live) Policy

### Adaptive TTL Strategy

```typescript
enum CacheContentType {
  STATIC_DOCUMENT,  // 24h (company policies, etc.)
  DYNAMIC_INFO,     // 1h  (schedules, events)
  POPULAR_QUERY,    // 4h  (high access frequency)
  RARE_QUERY,       // 30min (low access frequency)
}
```

**Rationale**:
- Static content changes infrequently → longer TTL
- Dynamic content may update → shorter TTL
- Popular queries benefit from longer cache → extended TTL
- Rare queries don't justify memory → shorter TTL

**Auto-Detection**:
```typescript
if (accessCount > 50) → POPULAR_QUERY
else if (query.includes('規則|ポリシー')) → STATIC_DOCUMENT
else if (query.includes('スケジュール|イベント')) → DYNAMIC_INFO
else → RARE_QUERY
```

---

## Performance Projections

### Expected Cache Hit Rates

| Layer | Hit Rate | Latency | Reasoning |
|-------|----------|---------|-----------|
| **L1** | 15-25% | <1ms | Recent exact queries |
| **L2** | 40-60% | 5-10ms | Semantic similarity broadens matches |
| **L3** | 10-15% | 50-100ms | Long-tail cold queries |
| **Overall** | **90-95%** | **<100ms avg** | Cumulative effect |

### Latency Improvements

| Scenario | Current | Target | Improvement |
|----------|---------|--------|-------------|
| **L1 Hit** | 20s | <1ms | **99.99%** |
| **L2 Hit** | 20s | 10ms | **99.95%** |
| **L3 Hit** | 20s | 100ms | **99.5%** |
| **Cold Start** | 20s | 20s | 0% (unavoidable) |
| **Average** | 20s | <1s | **95%+** |

---

## Cost Analysis

### Infrastructure Costs

| Component | Monthly Cost (USD) | Notes |
|-----------|-------------------|-------|
| Cloud Memorystore (Redis M1) | $150-200 | 4GB, HA, RediSearch |
| Cloud Firestore | $10-20 | 10M reads, 1M writes |
| Text Embedding API | $20-40 | 1M queries/month |
| Cloud Monitoring | $10-20 | Logs + metrics |
| **Total** | **$190-280** | |

### Cost Savings

**Current API Costs**:
- 10,000 FileSearch requests/month × $0.05 = **$500/month**

**With 95% Cache Hit Rate**:
- 500 FileSearch requests/month × $0.05 = **$25/month**

**Net Savings**:
```
$500 (current) - $25 (cached) - $280 (infrastructure) = $195/month savings
ROI = 39% reduction in total costs
```

**Plus Intangible Benefits**:
- ⭐ **User Satisfaction**: 95% faster responses
- ⭐ **Scalability**: Handle 10x more users with same API quota
- ⭐ **Analytics**: Query pattern insights

---

## Risk Assessment

### Risk 1: Cache Poisoning

**Description**: Malicious actors inject false data into cache

**Likelihood**: Low
**Impact**: High

**Mitigation**:
1. ✅ Validate cache entries before storing (schema + content checks)
2. ✅ No user-provided data directly in cache keys
3. ✅ Redis AUTH + VPC isolation
4. ✅ Firestore Security Rules

---

### Risk 2: Stale Cache Data

**Description**: Documents update but cache not invalidated

**Likelihood**: Medium
**Impact**: Medium

**Mitigation**:
1. ✅ Document upload triggers full cache invalidation
2. ✅ TTL-based auto-expiry (max 24h)
3. ✅ Manual admin invalidation API
4. ✅ Version tracking (future enhancement)

---

### Risk 3: Redis Outage

**Description**: Cloud Memorystore unavailable

**Likelihood**: Low (99.9% SLA)
**Impact**: Medium

**Mitigation**:
1. ✅ High Availability (HA) instance (auto-failover)
2. ✅ Graceful degradation: L2 failure → fallback to L3
3. ✅ L1 cache continues working
4. ✅ Monitoring alerts

---

### Risk 4: Embedding API Rate Limits

**Description**: Google Embeddings API quota exceeded

**Likelihood**: Low (generous free tier)
**Impact**: Medium

**Mitigation**:
1. ✅ L1 cache reduces embedding calls
2. ✅ Retry with exponential backoff
3. ✅ Fallback to exact matching if embedding fails
4. ✅ Monitor quota usage

---

### Risk 5: Memory Exhaustion (L1)

**Description**: InMemory cache grows too large

**Likelihood**: Low
**Impact**: Low

**Mitigation**:
1. ✅ MAX_ENTRIES limit (500 queries)
2. ✅ LRU eviction policy
3. ✅ Periodic cleanup (every 5 minutes)
4. ✅ Memory monitoring

---

## Rollback Plan

### Feature Flags

```typescript
CACHE_FEATURE_FLAGS = {
  ENABLE_L1_FILE_SEARCH: true,  // InMemory cache
  ENABLE_L2_SEMANTIC: true,     // Redis semantic cache
  ENABLE_L3_PERSISTENT: true,   // Firestore long-term
  ENABLE_CACHE_WARMING: true,   // Proactive pre-population
};
```

### Rollback Steps

```bash
# Emergency Rollback (if issues detected)

# Step 1: Disable L2 (Semantic Cache)
export ENABLE_L2_SEMANTIC=false
kubectl rollout restart deployment/retention-engine-server

# Step 2: Disable L1 (InMemory Cache)
export ENABLE_L1_FILE_SEARCH=false
kubectl rollout restart deployment/retention-engine-server

# Step 3: Full Rollback
git revert <cache-implementation-commit>
kubectl apply -f k8s/
```

### Rollback Triggers

- Cache hit rate < 50% for 1 hour
- Error rate > 5% attributed to cache
- P99 latency > 10s (worse than baseline)
- Redis memory usage > 90%

---

## Monitoring & Alerts

### Key Metrics

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| **Cache Hit Rate** | >90% | 70-90% | <70% |
| **L2 Latency** | <10ms | 10-20ms | >20ms |
| **FileSearch API Latency** | <20s | 20-30s | >30s |
| **Redis Memory Usage** | <70% | 70-85% | >85% |
| **Error Rate** | <1% | 1-5% | >5% |

### Alerts Configuration

```yaml
alerts:
  - name: CacheHitRateLow
    condition: cache_hit_rate < 80%
    duration: 1h
    severity: WARNING
    action: Investigate query patterns

  - name: RedisHighLatency
    condition: redis_latency_p95 > 20ms
    duration: 5m
    severity: WARNING
    action: Check Redis instance health

  - name: FileSearchAPIErrors
    condition: filesearch_error_rate > 5%
    duration: 5m
    severity: CRITICAL
    action: Check Gemini API status, consider fallback
```

---

## Success Criteria

### Must-Have (Go-Live Requirements)

- [ ] **Performance**: 90% of requests respond in <5s
- [ ] **Reliability**: Cache hit rate >85%
- [ ] **Quality**: Answer accuracy maintained (manual QA)
- [ ] **Cost**: API costs reduced by >70%
- [ ] **Stability**: Error rate <2%

### Nice-to-Have (Future Enhancements)

- [ ] Analytics dashboard (query patterns, popular topics)
- [ ] A/B testing framework (compare cached vs fresh)
- [ ] Auto-tuning similarity threshold
- [ ] Predictive cache warming (ML-based)
- [ ] Multi-region replication

---

## Future Considerations

### 1. Distributed Caching (Multi-Region)

**When**: User base grows beyond single region

**Approach**:
- Cloud Memorystore global replication
- Firestore multi-region setup
- Edge caching with Cloud CDN

---

### 2. ML-Based Cache Warming

**When**: Query patterns become more predictable

**Approach**:
- Analyze historical query data
- Predict popular queries by time/day
- Pre-warm cache before peak hours

---

### 3. Query Reformulation

**When**: Semantic matching needs improvement

**Approach**:
- LLM-based query rewriting
- Synonym expansion
- Context-aware similarity

---

### 4. Cache Versioning

**When**: Need to track document updates

**Approach**:
- Add version field to cache entries
- Invalidate by document version
- Gradual cache migration

---

## Approval

**Approved by**:
- System Architecture Team: ✅
- Backend Development Team: ✅
- DevOps Team: ✅
- Product Manager: ✅

**Date**: 2025-12-19

**Next Review**: After 30 days in production

---

## References

1. [Google Cloud Memorystore Documentation](https://cloud.google.com/memorystore)
2. [RediSearch Vector Similarity](https://redis.io/docs/stack/search/reference/vectors/)
3. [Google Text Embeddings](https://cloud.google.com/vertex-ai/docs/generative-ai/embeddings/get-text-embeddings)
4. [Cloud Firestore Best Practices](https://cloud.google.com/firestore/docs/best-practices)
5. [HNSW Algorithm Paper](https://arxiv.org/abs/1603.09320)

---

**Document Version**: 1.0
**Last Updated**: 2025-12-19
**Author**: System Architecture Designer
**Status**: Approved for Implementation
