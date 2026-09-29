from django.urls import path

from . import views

app_name = 'escalas'

urlpatterns = [
    path('', views.home, name='home'),
    path('practicar/', views.index, name='index'),
    path('progreso/', views.progress, name='progress'),
    path('camino/<slug:slug>/', views.path_detail, name='path'),
    path('camino/<slug:path_slug>/<slug:slug>/', views.module_detail, name='module'),
    path('canciones/', views.songs, name='songs'),
    path('canciones/subir-midi/', views.song_upload_midi, name='song_upload_midi'),
    path('canciones/<slug:slug>/subir-midi/', views.song_upload_score, name='song_upload_score'),
    path('canciones/<slug:slug>/', views.song_detail, name='song'),
    path('api/attempts/', views.create_attempt, name='create_attempt'),
]
