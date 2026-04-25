<template>
  <div class="min-h-screen bg-slate-100 p-6">
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-800">Government Admin Dashboard</h1>
        <div class="flex gap-3">
          <button
            @click="syncZones"
            class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Sync Zones From Gov API
          </button>
          <router-link to="/" class="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow hover:bg-slate-50">
            Back to map
          </router-link>
        </div>
      </div>

      <p v-if="message" class="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{{ message }}</p>
      <p v-if="error" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{{ error }}</p>

      <div class="grid gap-6 lg:grid-cols-2">
        <section class="rounded-2xl bg-white p-5 shadow">
          <h2 class="mb-4 text-lg font-semibold text-slate-800">Pending Company Verification</h2>
          <div v-if="pendingCompanies.length === 0" class="text-sm text-slate-500">No pending companies.</div>
          <div v-else class="space-y-3">
            <div v-for="company in pendingCompanies" :key="company.id" class="rounded-xl border border-slate-200 p-4">
              <p class="font-medium text-slate-800">{{ company.companyName || 'Unnamed company' }}</p>
              <p class="text-sm text-slate-500">{{ company.email }}</p>
              <button
                @click="verifyCompany(company.id)"
                class="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Verify Company
              </button>
            </div>
          </div>
        </section>

        <section class="rounded-2xl bg-white p-5 shadow">
          <h2 class="mb-4 text-lg font-semibold text-slate-800">Pending Parcel Requests</h2>
          <div v-if="pendingRequests.length === 0" class="text-sm text-slate-500">No pending parcel requests.</div>
          <div v-else class="space-y-4">
            <div v-for="request in pendingRequests" :key="request.id" class="rounded-xl border border-slate-200 p-4">
              <p class="text-sm font-semibold text-slate-800">Zone {{ request.zone?.type }} • {{ request.zone?.id }}</p>
              <p class="text-xs text-slate-500">Company: {{ request.company?.companyName || request.company?.email }}</p>
              <p class="text-xs text-slate-500">Current zone status: {{ request.zone?.status }}</p>

              <div class="mt-3 space-y-2">
                <label class="block text-xs text-slate-600">Publication type</label>
                <select
                  v-model="requestForms[request.id].publicationType"
                  class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="AUCTION">Auction</option>
                  <option value="TENDER">Tender</option>
                </select>

                <template v-if="requestForms[request.id].publicationType === 'AUCTION'">
                  <input v-model="requestForms[request.id].startDate" type="datetime-local" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input v-model="requestForms[request.id].endDate" type="datetime-local" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input v-model.number="requestForms[request.id].minBid" type="number" min="0" placeholder="Minimum bid" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input v-model.number="requestForms[request.id].maxFinalists" type="number" min="2" placeholder="Max finalists" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </template>

                <template v-else>
                  <input v-model="requestForms[request.id].deadline" type="datetime-local" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </template>

                <textarea v-model="requestForms[request.id].note" rows="2" placeholder="Review note" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>

              <div class="mt-3 flex gap-2">
                <button
                  @click="approveRequest(request.id)"
                  class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Approve & Publish
                </button>
                <button
                  @click="rejectRequest(request.id)"
                  class="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  Reject Request
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section class="rounded-2xl bg-white p-5 shadow">
        <h2 class="mb-4 text-lg font-semibold text-slate-800">Direct Zone Publishing (Gov Decision)</h2>
        <div v-if="publishableZones.length === 0" class="text-sm text-slate-500">
          No available zones ready for direct publishing.
        </div>
        <div v-else class="grid gap-4 lg:grid-cols-2">
          <div v-for="zone in publishableZones" :key="zone.id" class="rounded-xl border border-slate-200 p-4">
            <p class="text-sm font-semibold text-slate-800">Zone {{ zone.type }} • {{ zone.id }}</p>
            <p class="text-xs text-slate-500">Min price: ${{ Number(zone.minPrice).toLocaleString() }}</p>
            <p class="text-xs text-slate-500">{{ zone.description || 'No description' }}</p>

            <div class="mt-3 space-y-2">
              <label class="block text-xs text-slate-600">Publication type</label>
              <select
                v-model="requestForms[zone.id].publicationType"
                class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="AUCTION">Auction (low demand)</option>
                <option value="TENDER">Tender (high demand)</option>
              </select>

              <template v-if="requestForms[zone.id].publicationType === 'AUCTION'">
                <input v-model="requestForms[zone.id].startDate" type="datetime-local" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <input v-model="requestForms[zone.id].endDate" type="datetime-local" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <input v-model.number="requestForms[zone.id].minBid" type="number" min="0" placeholder="Minimum bid" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <input v-model.number="requestForms[zone.id].maxFinalists" type="number" min="2" placeholder="Max finalists" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </template>

              <template v-else>
                <input v-model="requestForms[zone.id].deadline" type="datetime-local" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </template>

              <textarea v-model="requestForms[zone.id].note" rows="2" placeholder="Publishing note" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>

            <button
              @click="publishZone(zone.id)"
              class="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Publish Zone
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import api from '../api'

type PublicationType = 'AUCTION' | 'TENDER'

const pendingCompanies = ref<any[]>([])
const pendingRequests = ref<any[]>([])
const publishableZones = ref<any[]>([])
const message = ref('')
const error = ref('')

const requestForms = reactive<Record<string, {
  publicationType: PublicationType
  startDate: string
  endDate: string
  minBid: number
  maxFinalists: number
  deadline: string
  note: string
}>>({})

function ensureForm(requestId: string) {
  if (!requestForms[requestId]) {
    const now = new Date()
    const plusWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const plusMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    requestForms[requestId] = {
      publicationType: 'AUCTION',
      startDate: now.toISOString().slice(0, 16),
      endDate: plusWeek.toISOString().slice(0, 16),
      minBid: 1000,
      maxFinalists: 6,
      deadline: plusMonth.toISOString().slice(0, 16),
      note: '',
    }
  }
}

async function loadData() {
  error.value = ''
  const [companiesRes, requestsRes, publishableRes] = await Promise.all([
    api.get('/auth/pending-companies'),
    api.get('/zones/requests/pending'),
    api.get('/zones/publishable'),
  ])
  pendingCompanies.value = companiesRes.data
  pendingRequests.value = requestsRes.data
  publishableZones.value = publishableRes.data
  for (const request of pendingRequests.value) {
    ensureForm(request.id)
  }
  for (const zone of publishableZones.value) {
    ensureForm(zone.id)
  }
}

async function verifyCompany(id: string) {
  message.value = ''
  error.value = ''
  try {
    await api.post(`/auth/companies/${id}/verify`)
    message.value = 'Company verified successfully.'
    await loadData()
  } catch (e: any) {
    error.value = e.response?.data?.message ?? 'Failed to verify company'
  }
}

async function syncZones() {
  message.value = ''
  error.value = ''
  try {
    await api.post('/zones/sync')
    message.value = 'Zone sync triggered successfully.'
  } catch (e: any) {
    error.value = e.response?.data?.message ?? 'Failed to sync zones'
  }
}

async function approveRequest(id: string) {
  message.value = ''
  error.value = ''
  try {
    const form = requestForms[id]
    const payload: any = {
      action: 'APPROVE',
      publicationType: form.publicationType,
      note: form.note,
    }

    if (form.publicationType === 'AUCTION') {
      payload.auction = {
        startDate: new Date(form.startDate).toISOString(),
        endDate: new Date(form.endDate).toISOString(),
        minBid: form.minBid,
        maxFinalists: form.maxFinalists,
      }
    } else {
      payload.tender = {
        deadline: new Date(form.deadline).toISOString(),
      }
    }

    await api.post(`/zones/requests/${id}/review`, payload)
    message.value = 'Request approved and published.'
    await loadData()
  } catch (e: any) {
    error.value = e.response?.data?.message ?? 'Failed to approve request'
  }
}

async function rejectRequest(id: string) {
  message.value = ''
  error.value = ''
  try {
    const form = requestForms[id]
    await api.post(`/zones/requests/${id}/review`, {
      action: 'REJECT',
      note: form.note,
    })
    message.value = 'Request rejected.'
    await loadData()
  } catch (e: any) {
    error.value = e.response?.data?.message ?? 'Failed to reject request'
  }
}

async function publishZone(zoneId: string) {
  message.value = ''
  error.value = ''
  try {
    const form = requestForms[zoneId]
    const payload: any = {
      publicationType: form.publicationType,
      note: form.note,
    }

    if (form.publicationType === 'AUCTION') {
      payload.auction = {
        startDate: new Date(form.startDate).toISOString(),
        endDate: new Date(form.endDate).toISOString(),
        minBid: form.minBid,
        maxFinalists: form.maxFinalists,
      }
    } else {
      payload.tender = {
        deadline: new Date(form.deadline).toISOString(),
      }
    }

    await api.post(`/zones/${zoneId}/publish`, payload)
    message.value = 'Zone published successfully.'
    await loadData()
  } catch (e: any) {
    error.value = e.response?.data?.message ?? 'Failed to publish zone'
  }
}

onMounted(async () => {
  try {
    await loadData()
  } catch (e: any) {
    error.value = e.response?.data?.message ?? 'Failed to load admin data'
  }
})
</script>
