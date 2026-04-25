<template>
  <div class="min-h-screen bg-slate-50 p-6">
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Active Auctions</h1>
          <p class="text-xs text-slate-500">For: {{ auth.companyName || auth.userEmail || 'Guest' }}</p>
        </div>
        <div class="flex items-center gap-3">
          <router-link to="/tenders" class="text-sm text-indigo-600 hover:underline">View Tenders</router-link>
          <router-link v-if="auth.isCompany" to="/my-activity" class="text-sm text-emerald-600 hover:underline">My Activity</router-link>
          <router-link to="/" class="text-sm text-blue-600 hover:underline">← Back to Map</router-link>
        </div>
      </div>

      <div v-if="loading" class="text-slate-400 text-center py-12">Loading auctions...</div>

      <div v-else-if="auctions.length === 0" class="text-slate-400 text-center py-12">No active auctions</div>

      <div v-else class="space-y-4">
        <div v-for="a in auctions" :key="a.id"
          class="bg-white rounded-2xl shadow p-5 flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="text-sm font-semibold text-slate-800">Zone: {{ a.zone?.type }}</span>
              <span :class="auctionStatusClass(a.status)" class="text-xs px-2 py-0.5 rounded-full font-medium">
                {{ a.status }}
              </span>
            </div>
            <p class="text-slate-500 text-sm">Min Bid: ${{ a.minBid?.toLocaleString() }}</p>
            <p class="text-slate-400 text-xs mt-1">Ends: {{ new Date(a.endDate).toLocaleDateString() }}</p>
            <p class="text-slate-400 text-xs">Bids placed: {{ a.bids?.length ?? 0 }}</p>
          </div>
          <router-link :to="`/auctions/${a.id}`"
            class="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-blue-700">
            View →
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../api'
import { useAuthStore } from '../stores/auth'

const auctions = ref<any[]>([])
const loading = ref(true)
const auth = useAuthStore()

onMounted(async () => {
  const res = await api.get('/auctions')
  auctions.value = res.data
  loading.value = false
})

function auctionStatusClass(status: string) {
  return status === 'OPEN'
    ? 'bg-green-100 text-green-700'
    : status === 'CLOSED'
    ? 'bg-slate-100 text-slate-500'
    : 'bg-orange-100 text-orange-700'
}
</script>
