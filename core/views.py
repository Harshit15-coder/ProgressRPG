from django.http import HttpResponse, Http404

from .models import StoredFile


def stored_file_view(request, pk):
    try:
        stored = StoredFile.objects.get(pk=pk)
    except StoredFile.DoesNotExist:
        raise Http404
    return HttpResponse(bytes(stored.data), content_type=stored.content_type)
