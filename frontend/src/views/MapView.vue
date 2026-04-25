<template>
  <div class="relative h-screen w-screen overflow-hidden">
    <!-- Map container -->
    <div id="map" class="absolute inset-0" />

    <!-- Top nav -->
    <div class="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
      <div class="bg-white rounded-xl shadow-lg px-5 py-3 flex items-center gap-3">
        <span class="text-lg font-bold text-slate-800">🏗️ ZonaPlatform</span>
        <span class="text-xs text-slate-400">Toshkent</span>
      </div>
      <div class="flex gap-2">
        <router-link to="/auctions" class="bg-white rounded-xl shadow px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Auctions
        </router-link>
        <template v-if="auth.isLoggedIn">
          <router-link v-if="auth.isGov" to="/admin" class="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-medium">
            Admin Panel
          </router-link>
          <button @click="auth.logout()" class="bg-slate-100 rounded-xl px-4 py-2 text-sm text-slate-600">
            Logout
          </button>
        </template>
        <template v-else>
          <router-link to="/login" class="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-medium">
            Login
          </router-link>
        </template>
      </div>
    </div>

    <!-- Legend -->
    <div class="absolute bottom-8 left-4 bg-white rounded-xl shadow-lg p-4 z-10 text-sm space-y-2">
      <p class="font-semibold text-slate-700 mb-1">Zone Types</p>
      <div v-for="item in legend" :key="item.label" class="flex items-center gap-2">
        <span class="w-4 h-4 rounded" :style="{ background: item.color, opacity: 0.75 }" />
        <span class="text-slate-600">{{ item.label }}</span>
      </div>
    </div>

    <!-- Zone info panel -->
    <transition name="slide">
      <div v-if="selectedZone" class="absolute top-20 right-4 w-72 bg-white rounded-2xl shadow-2xl p-5 z-10">
        <div class="flex justify-between items-start mb-3">
          <h3 class="font-bold text-slate-800 text-base">Zone Info</h3>
          <button @click="selectedZone = null" class="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-slate-500">Type</span>
            <span class="font-medium text-slate-800">{{ selectedZone.type }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Status</span>
            <span :class="statusClass(selectedZone.status)" class="font-semibold px-2 py-0.5 rounded-full text-xs">
              {{ selectedZone.status }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Min Price</span>
            <span class="font-medium text-slate-800">${{ selectedZone.minPrice?.toLocaleString() }}</span>
          </div>
          <p v-if="selectedZone.description" class="text-slate-500 pt-1 border-t">{{ selectedZone.description }}</p>
        </div>
        <router-link
          v-if="selectedZone.status === 'IN_AUCTION'"
          :to="`/auctions`"
          class="mt-4 block text-center bg-orange-500 text-white rounded-xl py-2 text-sm font-medium hover:bg-orange-600"
        >
          View Active Auction →
        </router-link>
      </div>
    </transition>

    <!-- Draw error / success panel (company only) -->
    <transition name="slide">
      <div v-if="auth.isCompany && (drawError || drawnParcel)" class="absolute bottom-8 right-4 w-80 bg-white rounded-2xl shadow-2xl p-5 z-10">
        <div v-if="drawError" class="text-red-600 text-sm font-medium">{{ drawError }}</div>
        <div v-else-if="drawnParcel">
          <p class="text-green-700 font-semibold mb-1">✅ Valid area selected!</p>
          <p class="text-slate-500 text-xs mb-4">This parcel is in an available zone. You can submit a bid request.</p>
          <button
            @click="submitParcel"
            :disabled="submitting"
            class="w-full bg-green-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-green-700"
          >
            {{ submitting ? 'Submitting...' : 'Submit Parcel Request' }}
          </button>
          <p v-if="submitMsg" class="text-green-700 text-xs mt-2">{{ submitMsg }}</p>
          <p v-if="submitErr" class="text-red-600 text-xs mt-2">{{ submitErr }}</p>
        </div>
      </div>
    </transition>

    <!-- Company draw hint -->
    <div v-if="auth.isCompany && !drawnParcel && !drawError"
      class="absolute bottom-8 right-4 bg-white/90 rounded-xl px-4 py-2 z-10 text-sm text-slate-600 shadow">
      🖊 Use the polygon tool to select a green zone
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useMap } from '../composables/useMap'
import { useRouter } from 'vue-router'
import api from '../api'

const auth = useAuthStore()
const router = useRouter()
const { selectedZone, selectedDrawZone, drawnParcel, drawError } = useMap('map')
const submitting = ref(false)
const submitMsg = ref('')
const submitErr = ref('')

const legend = [
  { label: 'Residential (available)', color: '#22c55e' },
  { label: 'Industrial (available)',  color: '#3b82f6' },
  { label: 'Commercial (available)',  color: '#f59e0b' },
  { label: 'Public Infra (available)',color: '#8b5cf6' },
  { label: 'In Auction',             color: '#f97316' },
  { label: 'In Tender',              color: '#6366f1' },
  { label: 'Awarded',                color: '#64748b' },
  { label: 'Restricted',             color: '#ef4444' },
]

function statusClass(status: string) {
  const map: Record<string, string> = {
    AVAILABLE: 'bg-green-100 text-green-700',
    IN_AUCTION: 'bg-orange-100 text-orange-700',
    IN_TENDER: 'bg-indigo-100 text-indigo-700',
    AWARDED: 'bg-slate-100 text-slate-600',
    RESTRICTED: 'bg-red-100 text-red-700',
  }
  return map[status] ?? 'bg-slate-100 text-slate-600'
}

async function submitParcel() {
  if (!drawnParcel.value) return
  if (!selectedDrawZone.value?.id) {
    submitErr.value = 'Select a valid available zone before submitting.'
    return
  }

  submitting.value = true
  submitErr.value = ''
  submitMsg.value = ''

  try {
    await api.post(`/zones/${selectedDrawZone.value.id}/requests`, {
      geometry: drawnParcel.value.geometry,
    })
    submitMsg.value = 'Request submitted. Government review is now required.'
    router.push('/auctions')
  } catch (e: any) {
    submitErr.value = e.response?.data?.message ?? 'Failed to submit request'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.slide-enter-active, .slide-leave-active { transition: all 0.25s ease; }
.slide-enter-from, .slide-leave-to { opacity: 0; transform: translateX(12px); }
</style>
