<template>
  <div class="min-h-screen bg-slate-50 p-6">
    <div class="max-w-5xl mx-auto">
      <div class="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Active Tenders</h1>
          <p class="text-xs text-slate-500">
            Account: {{ auth.userEmail || 'Guest' }} • Role: {{ auth.role || 'PUBLIC' }}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <router-link to="/auctions" class="text-sm text-indigo-600 hover:underline">View Auctions</router-link>
          <router-link to="/" class="text-sm text-blue-600 hover:underline">← Back to Map</router-link>
        </div>
      </div>

      <div v-if="loading" class="text-center py-12 text-slate-400">Loading tenders...</div>
      <div v-else-if="tenders.length === 0" class="text-center py-12 text-slate-400">No tenders available yet.</div>

      <div v-else class="space-y-4">
        <div
          v-for="t in tenders"
          :key="t.id"
          class="flex items-center justify-between rounded-2xl bg-white p-5 shadow transition-shadow hover:shadow-md"
        >
          <div>
            <div class="mb-1 flex items-center gap-2">
              <span class="text-sm font-semibold text-slate-800">Zone: {{ t.zone?.type || 'N/A' }}</span>
              <span :class="tenderStatusClass(t.status)" class="rounded-full px-2 py-0.5 text-xs font-medium">
                {{ t.status }}
              </span>
            </div>
            <p class="text-sm text-slate-500">Deadline: {{ new Date(t.deadline).toLocaleDateString() }}</p>
            <p class="text-xs text-slate-400">Proposals: {{ t.proposals?.length ?? 0 }}</p>
          </div>

          <router-link
            :to="`/tenders/${t.id}`"
            class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            View →
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import api from '../api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const tenders = ref<any[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await api.get('/tenders')
    tenders.value = res.data
  } finally {
    loading.value = false
  }
})

function tenderStatusClass(status: string) {
  return status === 'OPEN'
    ? 'bg-blue-100 text-blue-700'
    : status === 'AWARDED'
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-amber-100 text-amber-700'
}
</script>
