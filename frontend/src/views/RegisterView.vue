<template>
  <div class="min-h-screen bg-slate-100 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
      <h1 class="text-xl font-bold text-slate-800 mb-6">Register</h1>
      <div class="space-y-4">
        <input v-model="email" type="email" placeholder="Email"
          class="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <input v-model="password" type="password" placeholder="Password (min 8 chars)"
          class="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <select v-model="role"
          class="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500">
          <option value="PUBLIC">Public (read only)</option>
          <option value="COMPANY">Construction Company</option>
        </select>
        <input v-if="role === 'COMPANY'" v-model="companyName" placeholder="Company Name"
          class="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <p v-if="role === 'COMPANY'" class="text-xs text-slate-400">
          Company accounts require government verification before login is enabled.
        </p>
        <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
        <p v-if="success" class="text-green-600 text-sm">{{ success }}</p>
        <button @click="submit"
          class="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700">
          Register
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import api from '../api'

const email = ref('')
const password = ref('')
const role = ref('PUBLIC')
const companyName = ref('')
const error = ref('')
const success = ref('')

async function submit() {
  error.value = ''
  success.value = ''
  try {
    await api.post('/auth/register', { email: email.value, password: password.value, role: role.value, companyName: companyName.value })
    success.value = 'Registered! You can now log in (or await verification for company accounts).'
  } catch (e: any) {
    error.value = e.response?.data?.message ?? 'Registration failed'
  }
}
</script>
