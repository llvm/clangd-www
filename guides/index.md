# Guides

These articles describe how certain features work.

{% for entry in site.data.navigation %}
{% if entry.url == '/guides/' %}
{% for child in entry.children %}
## {{child.title}}

{{child.description}}

[{{child.title}}]({{child.url}})
{:.main-article}

{% endfor %}
{% endif %}
{% endfor %}
