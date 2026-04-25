import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('../views/MapView.vue') },
    { path: '/login', component: () => import('../views/LoginView.vue') },
    { path: '/register', component: () => import('../views/RegisterView.vue') },
    {
      path: '/auctions',
      component: () => import('../views/AuctionsView.vue'),
    },
    {
      path: '/auctions/:id',
      component: () => import('../views/AuctionDetail.vue'),
    },
    {
      path: '/tenders/:id',
      component: () => import('../views/TenderDetail.vue'),
    },
    {
      path: '/admin',
      component: () => import('../views/AdminView.vue'),
      meta: { requiresRole: 'GOV_ADMIN' },
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresRole && auth.role !== to.meta.requiresRole) {
    return '/login'
  }
})

export default router
