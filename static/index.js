import './marked.min.js'
import autocomp from './autocomp.js'

class NameFinderController {
    constructor(root, orgs_controller) {
        this.element = root
        this.nameTarget = root.querySelector('input[type=text]')
        this.matchesTarget = root.querySelector('ul#matches')
        this.headerTemplateTarget = root.querySelector('template#card-header')
        this.matchTemplateTarget = root.querySelector('template#card-match')
        this.orgs = orgs_controller
        this.connect()
    }
    connect() {
        this.populate_completion_list()
        this.load_matches()
        this.nameTarget.value = ''
        this.nameTarget.attributes.tabIndex = '1'
        const form = this.element.querySelector('form')
        form.addEventListener('submit', (event) => event.preventDefault())
        form.addEventListener('click', this.handle_buttons.bind(this))
        this.add_input_handlers(this.nameTarget)
        marked.use({ hooks: { postprocess: this.postprocess_html.bind(this) } })
    }

    add_input_handlers(element) {
        autocomp(element, {
            onQuery: this.ac_query.bind(this),
            onSelect: (text) => {
                element.value = text
                this.lookup()
                return text
            }
        })
    }

    ac_query(text) {
        return this.name_list.filter(name => name.includes(text))
    }

    add_more() {
        const row = this.element.querySelector(".name-row:first-child")
        const clone = row.cloneNode(true)
        const input = clone.querySelector('input[type=text]')
        input.value = ''
        row.parentNode.insertAdjacentElement("beforeend", clone)
        this.add_input_handlers(input)
    }

    del_row(event) {
        const row = event.target.closest(".name-row")
        row.parentNode.removeChild(row)
        this.lookup()
    }

    handle_buttons(event) {
        if (event.target.tagName != 'BUTTON') return
        if (event.target.className == 'add-name')
            this.add_more()
        else if (event.target.className == 'remove')
            this.del_row(event)
    }

    async load_matches() {
        const path = this.element.dataset.matches
        fetch(path)
            .then(response => response.json())
            .then(data => {
                this.all_matches = data
            })
            .catch(error => console.error('Error:', error))
    }

    async populate_completion_list() {
        const path = this.element.dataset.appearances
        fetch(path)
            .then(response => response.json())
            .then(data => {
                this.appearances = data
                this.name_list = Object.keys(data)
            })
            .catch(error => console.error('Error:', error))
    }

    all_names() {
        const inputs = this.element.querySelectorAll('input[type=text]')
        return Array.prototype.map.call(inputs, (el) => el.value)
    }

    lookup() {
        const names = this.all_names()
        const first = names.shift()
        const matches = this.appearances[first]
        if (!matches) {
            this.empty_result()
            return
        }
        let indices = matches.map(el => el[0])

        for (const other of names) {
            if (other == '') continue
            let other_matches = this.appearances[other]
            if (!other_matches) {
                this.empty_result()
                return
            }
            let other_indices = other_matches.map(el => el[0])
            indices = indices.filter(value => other_indices.includes(value))
        }

        if (indices.length == 0) {
            this.empty_result()
            return
        }
        this.show_matches(indices)
    }

    empty_result() {
        const header = this.headerTemplateTarget.content.cloneNode(true)
        this.matchesTarget.innerHTML = ''
        this.matchesTarget.appendChild(header)
    }

    postprocess_html(html) {
        return html.replace(/href="([^"]*)"/g, (match, p1) => {
            if (p1.startsWith('@')) {
                return `href="//tpwres.pl${this.transform_path(p1)}"`
            }
            return match
        })
    }

    transform_path(path) {
        return path.replace(/^@(.*)\/(.*)\.md$/, (match, dir, filename) => {
           return `${dir}/${filename.replace(/[_]/g, '-')}` 
        })
    }


    show_matches(indices) {
        const header = this.headerTemplateTarget.content.cloneNode(true)
        this.matchesTarget.innerHTML = ''
        this.matchesTarget.appendChild(header)
        const match_template = this.matchTemplateTarget.content

        const matches = indices.map((index) => structuredClone(this.all_matches[index]))
        matches.sort((a, b) => new Date(b.d) - new Date(a.d))

        for (const match of matches) {
            const t = match_template.cloneNode(true)

            const d = t.querySelector('.d')
            d.innerHTML = match['d']
            d.datetime = match['d']

            const o = t.querySelector('.o')
            for (const org of match['o']) {
                o.appendChild(this.orgs.get_badge(org))
            }

            const r = t.querySelector('.r')
            r.innerHTML = this.format_details(match)

            this.matchesTarget.appendChild(t)
        }
    }

    format_details(match) {
        let event_name = match.n
        let participants = match.m
        const { length, [length - 1]: last } = participants
        let options

        if (typeof last === 'object') {
            options = last
            participants.pop()
        } else
            options = {}

        let head = ''
        let participant_sep = ' and '
        let sep = options.nc ? ' vs ' : ' defeated '
        let end = options.nc ? ` - ${options.nc}` : options.r ? ` via ${options.r}` : ''
        if (end == '' && new Date(match.d) > new Date()) {
            end = ' - upcoming'
            sep = ' vs '
        }
        if (options.g) {
            participant_sep = ", "
            sep = ', '
            head = '<strong>Segment: </strong>'
        }

        const winner = participants.shift()
        const matchtype = options.s || 'Singles Match'
        const title = options.c || ''

        let text = head
        text += this.format_names(winner)
        if (participants.length > 0)
            text += sep
        text += participants.map((name) => this.format_names(name)).join(participant_sep)
        text += end
        text += '<br/>'

        if (title)
            text += `<strong>${marked.parseInline(title)}</strong> `
        text += `<strong>${marked.parseInline(matchtype)}</strong> at `
        text += this.format_link(event_name, match.p)

        return text
    }

    format_names(names) {
        // Split names on plus, comma or semicolon, then pass each name to format_name and join with the original symbols
        const splitNames = names.split(/(\s+(?:\+|,|;)\s+)/);
        return splitNames.map((part) => {
            // Only format the parts that are names, not the delimiters
            if (part.match(/(\s+(?:\+|,|;)\s+)/)) {
                return part;
            } else {
                return marked.parseInline(part)
            }
        }).join('');
    }


    format_link(title, target) {
        return marked.parseInline(`[${title}](@/${target})`)
    }
}

class OrgsController {
    constructor(root) {
        this.element = root
    }
    get_badge(org) {
        const id = `#org-badge-${org}`
        const el = this.element.querySelector(id)
        if (el)
            return el.content.cloneNode(true)

        let badge = document.getElementById('org-badge-zzz').content.cloneNode(true)
        badge.querySelector('a.org-badge span').textContent = org.toUpperCase()
        badge.querySelector('a.org-badge').href = this.org_link(org)
        return badge
    }

    org_link(org) {
        return `//tpwres.pl/o/${org}`
    }
}

const orgs_data = document.querySelector('data#orgs')
let orgs = new OrgsController(orgs_data)
const root = document.querySelector('#namefinder')
new NameFinderController(root, orgs)
