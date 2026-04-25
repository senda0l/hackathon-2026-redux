<template>
  <div class="min-h-screen bg-slate-50 p-6">
    <div class="max-w-2xl mx-auto">
      <router-link to="/auctions" class="text-sm text-blue-600 hover:underline">← All Auctions</router-link>

      <div v-if="auction" class="mt-4 space-y-6">
        <div class="bg-white rounded-2xl shadow p-6">
          <h1 class="text-xl font-bold text-slate-800 mb-1">Auction: {{ auction.zone?.type }} Zone</h1>
          <p class="text-slate-500 text-sm">Min Bid: ${{ auction.minBid?.toLocaleString() }}</p>
          <p class="text-slate-500 text-sm">Ends: {{ new Date(auction.endDate).toLocaleString() }}</p>
          <p class="text-slate-500 text-sm">Max Finalists: {{ auction.maxFinalists }}</p>
          <p class="text-slate-500 text-sm">Publication: {{ auction.zone?.publicationType || 'AUCTION' }}</p>
        </div>

        <div v-if="auth.isCompany && auction.status === 'OPEN'" class="bg-white rounded-2xl shadow p-6">
          <h2 class="font-semibold text-slate-800 mb-3">Place Your Bid</h2>
          <div class="flex gap-3">
            <input
              v-model.number="bidAmount"
              type="number"
              :min="auction.minBid"
              class="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter bid amount ($)"
            />
            <button
              @click="placeBid"
              class="bg-blue-600 text-white rounded-xl px-5 py-2 text-sm font-semibold hover:bg-blue-700"
            >
              Bid
            </button>
          </div>
          <p v-if="bidError" class="text-red-500 text-xs mt-2">{{ bidError }}</p>
          <p v-if="bidSuccess" class="text-green-600 text-xs mt-2">{{ bidSuccess }}</p>
        </div>

        <div class="bg-white rounded-2xl shadow p-6">
          <h2 class="font-semibold text-slate-800 mb-3">All Bids (Public)</h2>
          <div v-if="auction.bids?.length === 0" class="text-slate-400 text-sm">No bids yet</div>
          <div v-else class="space-y-2">
            <div
              v-for="(bid, i) in sortedBids"
              :key="bid.id"
              class="flex justify-between items-center text-sm py-2 border-b last:border-0"
            >
              <div class="flex items-center gap-2">
                <span v-if="i === 0" class="text-yellow-500 font-bold text-base">👑</span>
                <span class="text-slate-700 font-medium">{{ bid.company?.companyName ?? 'Company' }}</span>
              </div>
              <div class="text-right">
                <p class="font-semibold text-slate-800">${{ bid.amount.toLocaleString() }}</p>
                <p class="text-slate-400 text-xs">{{ new Date(bid.placedAt).toLocaleString() }}</p>
              </div>
            </div>
          </div>
        </div>

        <div v-if="auction.finalists?.length > 0" class="bg-green-50 rounded-2xl shadow p-6">
          <h2 class="font-semibold text-green-800 mb-3">🏆 Top Bids</h2>
          <div v-for="f in auction.finalists" :key="f.id" class="text-sm text-green-700 py-1">
            Company ID: {{ f.companyId }} — Bid: ${{ f.bidAmount.toLocaleString() }}
          </div>
        </div>

        <div v-if="auth.isGov" class="bg-white rounded-2xl shadow p-6 space-y-4">
          <h2 class="font-semibold text-slate-800">Government Controls</h2>
          <button
            v-if="auction.status === 'OPEN'"
            @click="closeAndAwardAuction"
            class="w-full bg-indigo-600 text-white rounded-xl px-5 py-2 text-sm font-semibold hover:bg-indigo-700"
          >
            Close Auction & Award
          </button>
          <p v-else class="text-xs text-slate-500">
            Auction already closed. Zone remains in auction path (no tender transition).
          </p>
          <p v-if="govMsg" class="text-green-600 text-xs">{{ govMsg }}</p>
          <p v-if="govErr" class="text-red-500 text-xs">{{ govErr }}</p>
        </div>
      </div>

      <div v-else class="text-center text-slate-400 py-12">Loading...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import api from '../api'

const route = useRoute()
const auth = useAuthStore()
const auction = ref<any>(null)
const bidAmount = ref<number>(0)
const bidError = ref('')
const bidSuccess = ref('')
const govMsg = ref('')
const govErr = ref('')

onMounted(async () => {
  const res = await api.get(`/auctions/${route.params.id}`)
  auction.value = res.data
  bidAmount.value = res.data.minBid
})

const sortedBids = computed(() =>
  [...(auction.value?.bids ?? [])].sort((a, b) => b.amount - a.amount)
)

async function placeBid() {
  bidError.value = ''
  bidSuccess.value = ''
  try {
    await api.post(`/auctions/${auction.value.id}/bid`, { amount: bidAmount.value })
    bidSuccess.value = 'Bid placed successfully!'
    const res = await api.get(`/auctions/${route.params.id}`)
    auction.value = res.data
  } catch (e: any) {
    bidError.value = e.response?.data?.message ?? 'Failed to place bid'
  }
}

async function closeAndAwardAuction() {
  govErr.value = ''
  govMsg.value = ''
  try {
    await api.post(`/auctions/${auction.value.id}/finalists`)
    govMsg.value = 'Auction closed and winner awarded successfully.'
    const res = await api.get(`/auctions/${route.params.id}`)
    auction.value = res.data
  } catch (e: any) {
    govErr.value = e.response?.data?.message ?? 'Failed to close auction'
  }
}
</script>
