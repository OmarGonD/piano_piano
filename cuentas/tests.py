from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

User = get_user_model()
DATA = {'username': 'lucia', 'first_name': 'Lucía', 'email': 'Lucia@Example.com',
        'password1': 'teclas-blancas-88', 'password2': 'teclas-blancas-88'}


class RegistrationTests(TestCase):
    def test_app_requires_login(self):
        for name in ('escalas:home', 'escalas:songs', 'escalas:progress'):
            res = self.client.get(reverse(name))
            self.assertRedirects(res, reverse('login') + '?next=' + reverse(name), fetch_redirect_response=False)
        self.assertEqual(self.client.get(reverse('register')).status_code, 200)
        self.assertEqual(self.client.get(reverse('login')).status_code, 200)

    def test_register_creates_inactive_account_and_shows_contact(self):
        res = self.client.post(reverse('register'), DATA)
        user = User.objects.get(username='lucia')
        self.assertFalse(user.is_active)
        self.assertEqual(user.email, 'lucia@example.com')
        self.assertContains(res, 'pendiente de activación')
        self.assertContains(res, 'mailto:oma.gonzales@gmail.com?subject=Activar%20cuenta%3A%20lucia')
        self.assertContains(res, 'Usuario%3A%20lucia')

    def test_duplicate_email_rejected(self):
        self.client.post(reverse('register'), DATA)
        res = self.client.post(reverse('register'), {**DATA, 'username': 'otra'})
        self.assertContains(res, 'Ya hay una cuenta con este correo.')

    def test_inactive_login_explains_pending_activation(self):
        self.client.post(reverse('register'), DATA)
        res = self.client.post(reverse('login'), {'username': 'lucia', 'password': DATA['password1']})
        self.assertContains(res, 'Tu cuenta aún no está activada')
        res = self.client.post(reverse('login'), {'username': 'lucia', 'password': 'equivocada'})
        self.assertNotContains(res, 'aún no está activada')

    def test_admin_action_activates_and_user_can_log_in(self):
        self.client.post(reverse('register'), DATA)
        admin = User.objects.create_superuser('admin', 'a@a.com', 'admin-clave-123')
        self.client.force_login(admin)
        user = User.objects.get(username='lucia')
        res = self.client.post(reverse('admin:auth_user_changelist'),
                               {'action': 'activate', '_selected_action': [user.pk]})
        self.assertEqual(res.status_code, 302)
        user.refresh_from_db()
        self.assertTrue(user.is_active)
        self.client.logout()
        res = self.client.post(reverse('login'), {'username': 'lucia', 'password': DATA['password1']})
        self.assertRedirects(res, reverse('escalas:home'))
        self.assertContains(self.client.get(reverse('escalas:home')), 'Lucía')

    def test_logout(self):
        user = User.objects.create_user('pepe', password='clave-segura-123')
        self.client.force_login(user)
        res = self.client.post(reverse('logout'))
        self.assertRedirects(res, reverse('login'))
        self.assertEqual(self.client.get(reverse('escalas:home')).status_code, 302)


class PreferencesTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('pepe', password='clave-segura-123')
        self.client.force_login(self.user)

    def test_song_view_defaults_to_staff_and_can_change(self):
        song = reverse('escalas:song', args=['passacaglia'])
        self.assertContains(self.client.get(song), '"view": "staff"')
        self.assertContains(self.client.get(reverse('escalas:home')), reverse('preferences'))
        res = self.client.post(reverse('preferences'), {'song_view': 'rain'}, follow=True)
        self.assertContains(res, 'Preferencias guardadas')
        self.assertContains(self.client.get(song), '"view": "rain"')
        # cada usuario tiene la suya
        other = User.objects.create_user('ana', password='clave-segura-123')
        self.client.force_login(other)
        self.assertContains(self.client.get(song), '"view": "staff"')

    def test_quick_change_from_song_returns_json(self):
        res = self.client.post(reverse('preferences'), {'song_view': 'rain'}, HTTP_ACCEPT='application/json')
        self.assertEqual(res.json(), {'song_view': 'rain'})
        self.assertContains(self.client.get(reverse('escalas:song', args=['passacaglia'])), '"view": "rain"')
        res = self.client.post(reverse('preferences'), {'song_view': 'otra'}, HTTP_ACCEPT='application/json')
        self.assertEqual(res.status_code, 400)

    def test_invalid_choice_is_rejected(self):
        res = self.client.post(reverse('preferences'), {'song_view': 'otra'})
        self.assertEqual(res.status_code, 200)
        from .models import Preferences
        self.assertFalse(Preferences.objects.filter(user=self.user).exists())
