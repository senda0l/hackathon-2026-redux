<template>
  <div class="min-h-screen bg-slate-100 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
      <h1 class="text-xl font-bold text-slate-800 mb-6">Login to ZonaPlatform</h1>
      <div class="space-y-4">
        <input v-model="email" type="email" placeholder="Email"
          class="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <input v-model="password" type="password" placeholder="Password"
          class="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
        <button @click="submit"
          class="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700">
          Login
        </button>
        <p class="text-center text-sm text-slate-500">
          No account? <router-link to="/register" class="text-blue-600 hover:underline">Register</router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const email = ref('')
const password = ref('')
const error = ref('')

async function submit() {
  error.value = ''
  try {
    await auth.login(email.value, password.value)
    router.push('/')
  } catch (e: any) {
    error.value = e.response?.data?.message ?? 'Login failed'
  }
}
</script>
