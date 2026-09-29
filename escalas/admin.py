from django.contrib import admin

from .models import Attempt, LearningPath, Module, Progression, ScaleType, Song, SongArrangement


@admin.register(ScaleType)
class ScaleTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'intervals', 'fingering', 'order', 'active']
    list_editable = ['order', 'active']
    prepopulated_fields = {'slug': ['name']}


@admin.register(Progression)
class ProgressionAdmin(admin.ModelAdmin):
    list_display = ['code', 'key_mode', 'order', 'active']
    list_filter = ['key_mode']
    list_editable = ['order', 'active']


@admin.register(Attempt)
class AttemptAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'user', 'title', 'mode', 'accuracy', 'score', 'errors', 'bpm', 'duration']
    list_filter = ['mode', 'user']
    search_fields = ['title', 'config_key', 'user__username']
    date_hierarchy = 'created_at'


class ModuleInline(admin.TabularInline):
    model = Module
    fields = ['level', 'order', 'title', 'slug', 'kind', 'active']
    show_change_link = True
    extra = 0


@admin.register(LearningPath)
class LearningPathAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'order', 'active']
    list_editable = ['order', 'active']
    prepopulated_fields = {'slug': ['name']}
    inlines = [ModuleInline]


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ['title', 'path', 'level', 'kind', 'order', 'active']
    list_filter = ['path', 'level', 'kind']
    list_editable = ['level', 'order', 'active']
    prepopulated_fields = {'slug': ['title']}


class SongArrangementInline(admin.StackedInline):
    model = SongArrangement
    extra = 0


@admin.register(Song)
class SongAdmin(admin.ModelAdmin):
    list_display = ['title', 'composer', 'category', 'order', 'active']
    list_filter = ['category']
    list_editable = ['category', 'order', 'active']
    prepopulated_fields = {'slug': ['title']}
    inlines = [SongArrangementInline]
