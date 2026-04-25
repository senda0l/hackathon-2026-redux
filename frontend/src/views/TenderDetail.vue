<template>
  <div class="min-h-screen bg-slate-50 p-6">
    <div class="mx-auto max-w-5xl space-y-5">
      <div class="flex items-center justify-between">
        <router-link to="/" class="text-sm text-blue-600 hover:underline">← Back to map</router-link>
        <div class="flex items-center gap-3">
          <router-link to="/tenders" class="text-sm text-indigo-600 hover:underline">All Tenders</router-link>
          <span class="text-xs text-slate-500">User: {{ auth.userEmail || 'Guest' }} • {{ auth.role || 'PUBLIC' }}</span>
        </div>
      </div>

      <div v-if="loading" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow">Loading tender...</div>

      <template v-else-if="tender">
        <div class="rounded-2xl bg-white p-6 shadow">
          <h1 class="text-xl font-bold text-slate-800">Tender {{ tender.id }}</h1>
          <p class="mt-1 text-sm text-slate-500">Zone: {{ tender.auction?.zone?.type || 'N/A' }}</p>
          <p class="text-sm text-slate-500">Status: {{ tender.status }}</p>
          <p class="text-sm text-slate-500">Deadline: {{ new Date(tender.deadline).toLocaleString() }}</p>
        </div>

        <div v-if="auth.isCompany && tender.status !== 'AWARDED'" class="rounded-2xl bg-white p-6 shadow">
          <h2 class="mb-3 text-lg font-semibold text-slate-800">Submit Proposal</h2>
          <div class="grid gap-3 md:grid-cols-2">
            <input v-model="proposal.constructionType" placeholder="Construction type" class="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input v-model="proposal.budget" type="number" min="0" placeholder="Budget" class="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input v-model="proposal.estimatedCompletion" type="date" class="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input v-model="proposal.documentUrl" placeholder="Document URL (optional)" class="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <textarea v-model="proposal.description" rows="4" placeholder="Proposal description" class="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <button @click="submitProposal" class="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Submit Proposal</button>
        </div>

        <div class="rounded-2xl bg-white p-6 shadow">
          <h2 class="mb-3 text-lg font-semibold text-slate-800">Proposals</h2>
          <div v-if="tender.proposals.length === 0" class="text-sm text-slate-500">No proposals yet.</div>
          <div v-else class="space-y-3">
            <div v-for="item in tender.proposals" :key="item.id" class="rounded-xl border border-slate-200 p-4">
              <p class="font-semibold text-slate-800">{{ item.company?.companyName || item.company?.id }}</p>
              <p class="text-xs text-slate-500">{{ item.constructionType }} • Budget ${{ Number(item.budget).toLocaleString() }}</p>
              <p class="mt-1 text-sm text-slate-700">{{ item.description }}</p>
              <p v-if="item.score" class="mt-2 text-xs font-semibold text-emerald-700">Score: {{ item.score.total }}</p>

              <div v-if="auth.isGov" class="mt-3 grid gap-2 md:grid-cols-4">
                <input v-model.number="scoreForms[item.id].designScore" type="number" min="0" max="100" placeholder="Design" class="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                <input v-model.number="scoreForms[item.id].timelineScore" type="number" min="0" max="100" placeholder="Timeline" class="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                <input v-model.number="scoreForms[item.id].socialScore" type="number" min="0" max="100" placeholder="Social" class="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                <button @click="scoreProposal(item.id)" class="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700">Score</button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="auth.isGov && tender.status !== 'AWARDED'" class="rounded-2xl bg-white p-6 shadow">
          <button @click="awardWinner" class="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            Award Winner
          </button>
        </div>
      </template>

      <p v-if="message" class="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{{ message }}</p>
      <p v-if="error" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '../api'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const auth = useAuthStore()

const loading = ref(true)
const tender = ref<any | null>(null)
const message = ref('')
const error = ref('')

const proposal = reactive({
  description: '',
  constructionType: '',
  estimatedCompletion: '',
  budget: '',
  documentUrl: '',
})

const scoreForms = reactive<Record<string, { designScore: number; timelineScore: number; socialScore: number }>>({})

function ensureScoreForm(id: string) {
  if (!scoreForms[id]) {
    scoreForms[id] = { designScore: 0, timelineScore: 0, socialScore: 0 }
  }
}

async function loadTender() {
  loading.value = true
  try {
    const res = await api.get(`/tenders/${route.params.id}`)
    tender.value = res.data
    for (const item of tender.value?.proposals ?? []) {
      ensureScoreForm(item.id)
      if (item.score) {
        scoreForms[item.id] = {
          designScore: item.score.designScore,
          timelineScore: item.score.timelineScore,
          socialScore: item.score.socialScore,
        }
      }
    }
  } finally {
    loading.value = false
  }
}

async function submitProposal() {
  message.value = ''
  error.value = ''
  try {
    await api.post(`/tenders/${tender.value.id}/proposals`, {
      description: proposal.description,
      constructionType: proposal.constructionType,
      estimatedCompletion: new Date(proposal.estimatedCompletion).toISOString(),
      budget: Number(proposal.budget),
      documentUrl: proposal.documentUrl || undefined,
    })
    message.value = 'Proposal submitted successfully.'
    await loadTender()
  } catch (e: any) {
    error.value = e.response?.data?.message ?? 'Failed to submit proposal'
  }
}

async function scoreProposal(proposalId: string) {
  message.value = ''
  error.value = ''
  try {
    await api.post(`/tenders/proposals/${proposalId}/score`, scoreForms[proposalId])
    message.value = 'Proposal scored successfully.'
    await loadTender()
  } catch (e: any) {
    error.value = e.response?.data?.message ?? 'Failed to score proposal'
  }
}

async function awardWinner() {
  message.value = ''
  error.value = ''
  try {
    await api.post(`/tenders/${tender.value.id}/award`)
    message.value = 'Winner awarded successfully.'
    await loadTender()
  } catch (e: any) {
    error.value = e.response?.data?.message ?? 'Failed to award winner'
  }
}

onMounted(async () => {
  try {
    await loadTender()
  } catch (e: any) {
    error.value = e.response?.data?.message ?? 'Failed to load tender'
  }
})
</script>
