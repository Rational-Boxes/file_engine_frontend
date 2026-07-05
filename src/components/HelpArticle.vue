<template>
  <article v-if="topic" class="help-article">
    <h1 class="help-article-title">{{ topic.title }}</h1>
    <!-- Content is first-party (renderTopic sanitizes anyway). Clicks are
         delegated so in-article links to other topics navigate within the modal
         rather than reloading the page. -->
    <div class="help-content" v-html="html" @click="onClick"></div>

    <nav v-if="related.length" class="help-seealso" aria-label="Related topics">
      <h2 class="help-seealso-h">See also</h2>
      <ul>
        <li v-for="t in related" :key="t.id">
          <button class="help-link" type="button" @click="emit('navigate', t.id)">{{ t.title }}</button>
        </li>
      </ul>
    </nav>
  </article>
  <p v-else class="help-missing">Sorry, that help topic could not be found.</p>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getTopic, renderTopic } from '@/help'

const props = defineProps<{ topicId: string }>()
const emit = defineEmits<{ (e: 'navigate', id: string): void }>()

const topic = computed(() => getTopic(props.topicId))
const html = computed(() => renderTopic(props.topicId))
const related = computed(() =>
  (topic.value?.related ?? []).map(getTopic).filter((t): t is NonNullable<typeof t> => !!t),
)

// Author internal links as [text](#topic-id). Those resolve to a known topic ->
// navigate in place. Everything else is an external link -> open in a new tab.
function onClick(e: MouseEvent) {
  const a = (e.target as HTMLElement).closest('a')
  if (!a) return
  const href = a.getAttribute('href') || ''
  if (href.startsWith('#')) {
    const id = href.slice(1)
    if (getTopic(id)) {
      e.preventDefault()
      emit('navigate', id)
    }
  } else if (/^https?:/i.test(href)) {
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener noreferrer')
  }
}
</script>

<style scoped>
.help-article-title {
  margin: 0 0 12px;
  font-size: 1.4rem;
}
/* Typographic styles for rendered markdown, matching app conventions. */
.help-content {
  line-height: 1.6;
}
.help-content :deep(h2) {
  font-size: 1.15rem;
  margin: 22px 0 8px;
}
.help-content :deep(h3) {
  font-size: 1rem;
  margin: 18px 0 6px;
}
.help-content :deep(p),
.help-content :deep(ul),
.help-content :deep(ol) {
  margin: 8px 0;
}
.help-content :deep(li) {
  margin: 4px 0;
}
.help-content :deep(a) {
  color: var(--primary);
}
.help-content :deep(code) {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 0.9em;
}
.help-content :deep(pre) {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  overflow: auto;
}
.help-content :deep(pre code) {
  border: none;
  padding: 0;
  background: transparent;
}
.help-content :deep(table) {
  border-collapse: collapse;
  margin: 12px 0;
}
.help-content :deep(th),
.help-content :deep(td) {
  border: 1px solid var(--border);
  padding: 6px 10px;
  text-align: left;
}
.help-content :deep(blockquote) {
  margin: 12px 0;
  padding: 4px 14px;
  border-left: 3px solid var(--border);
  color: var(--muted);
}

.help-seealso {
  margin-top: 28px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.help-seealso-h {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  margin: 0 0 8px;
}
.help-seealso ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.help-link {
  border: none;
  background: transparent;
  color: var(--primary);
  padding: 2px 0;
  font-size: 0.95rem;
  text-align: left;
}
.help-link:hover {
  text-decoration: underline;
}
.help-missing {
  color: var(--muted);
}
</style>
