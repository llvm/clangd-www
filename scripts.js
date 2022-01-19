// Inside each <h2 id="section">, add <a href="#section">#</a>.
document.querySelectorAll('h2[id], h3[id], h4[id]').forEach(header => {
  var link = document.createElement('a');
  link.className = 'anchor-link';
  link.href = '#' + header.id;
  link.textContent = '#';
  var span = document.createElement('span');
  span.textContent = header.id;
  link.appendChild(span);
  header.appendChild(link);
});
