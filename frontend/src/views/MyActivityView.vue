<template>
  <div class="min-h-screen bg-slate-50 p-6">
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">My Activity</h1>
          <p class="text-xs text-slate-500">Company: {{ auth.companyName || auth.userEmail || 'Guest' }}</p>
        </div>
        <div class="flex items-center gap-3">
          <router-link to="/auctions" class="text-sm text-blue-600 hover:underline">Auctions</router-link>
          <router-link to="/tenders" class="text-sm text-indigo-600 hover:underline">Tenders</router-link>
          <router-link to="/" class="text-sm text-slate-600 hover:underline">← Back to Map</router-link>
        </div>
      </div>

      <p v-if="error" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{{ error }}</p>

      <section class="rounded-2xl bg-white p-5 shadow">
        <h2 class="mb-4 text-lg font-semibold text-slate-800">Parcel Requests</h2>
        <div v-if="requests.length === 0" class="text-sm text-slate-500">No requests yet.</div>
        <div v-else class="space-y-3">
          <div v-for="r in requests" :key="r.id" class="rounded-xl border border-slate-200 p-4">
            <p class="text-sm font-semibold text-slate-800">Zone: {{ r.zone?.type }} • {{ r.zone?.id }}</p>
            <p class="text-xs text-slate-500">Requested Type: {{ r.requestedType || 'N/A' }}</p>
            <p class="text-xs text-slate-500">Status: {{ r.status }}</p>
            <p v-if="r.note" class="text-xs text-slate-500">Review note: {{ r.note }}</p>
            <p class="text-xs text-slate-400">Created: {{ new Date(r.createdAt).toLocaleString() }}</p>
          </div>
        </div>
      </section>

      <section class="rounded-2xl bg-white p-5 shadow">
        <h2 class="mb-4 text-lg font-semibold text-slate-800">Auction Bids</h2>
        <div v-if="bids.length === 0" class="text-sm text-slate-500">No bids yet.</div>
        <div v-else class="space-y-3">
          <div v-for="b in bids" :key="b.id" class="rounded-xl border border-slate-200 p-4">
            <p class="text-sm font-semibold text-slate-800">Auction: {{ b.auction?.id }}</p>
            <p class="text-xs text-slate-500">Zone: {{ b.auction?.zone?.type }}</p>
            <p class="text-xs text-slate-500">Bid: ${{ Number(b.amount).toLocaleString() }}</p>
            <p class="text-xs text-slate-500">Auction status: {{ b.auction?.status }}</p>
            <p class="text-xs text-slate-400">Placed: {{ new Date(b.placedAt).toLocaleString() }}</p>
          </div>
        </div>
      </section>

      <section class="rounded-2xl bg-white p-5 shadow">
        <h2 class="mb-4 text-lg font-semibold text-slate-800">Tender Proposals</h2>
        <div v-if="proposals.length === 0" class="text-sm text-slate-500">No proposals yet.</div>
        <div v-else class="space-y-3">
          <div v-for="p in proposals" :key="p.id" class="rounded-xl border border-slate-200 p-4">
            <p class="text-sm font-semibold text-slate-800">Tender: {{ p.tender?.id }}</p>
            <p class="text-xs text-slate-500">Zone: {{ p.tender?.zone?.type }}</p>
            <p class="text-xs text-slate-500">Budget: ${{ Number(p.budget).toLocaleString() }}</p>
            <p class="text-xs text-slate-500">Tender status: {{ p.tender?.status }}</p>
            <p v-if="p.score" class="text-xs text-emerald-700 font-semibold">Score: {{ p.score.total }}</p>
            <p class="text-xs text-slate-400">Submitted: {{ new Date(p.submittedAt).toLocaleString() }}</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import api from '../api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const error = ref('')
const requests = ref<any[]>([])
const bids = ref<any[]>([])
const proposals = ref<any[]>([])

onMounted(async () => {
  error.value = ''
  try {
    const [reqRes, bidRes, proposalRes] = await Promise.all([
      api.get('/zones/requests/mine'),
      api.get('/auctions/bids/mine'),
      api.get('/tenders/proposals/mine'),
    ])
    requests.value = reqRes.data
    bids.value = bidRes.data
    proposals.value = proposalRes.data
  } catch (e: any) {
    error.value = e.response?.data?.message ?? 'Failed to load company activity'
  }
})
</script>
