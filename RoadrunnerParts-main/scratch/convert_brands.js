import fs from 'fs';

const data = `brand	abv	target_brand	exploded_view_search_url	is_alias_or_rollup
Acros	whi	Whirlpool	https://encompass.com/Exploded-View-Search/whi/Whirlpool	TRUE
Affresh	whi	Whirlpool	https://encompass.com/Exploded-View-Search/whi/Whirlpool	TRUE
Amana	whi	Whirlpool	https://encompass.com/Exploded-View-Search/whi/Whirlpool	TRUE
Aeon Air	anr	Aeon_Air	https://encompass.com/Exploded-View-Search/anr/Aeon_Air	FALSE
Avanti	AVA	Avanti	https://encompass.com/Exploded-View-Search/AVA/Avanti	FALSE
Bauknecht	whi	Whirlpool	https://encompass.com/Exploded-View-Search/whi/Whirlpool	TRUE
Bertazzoni	brt	Bertazzoni	https://encompass.com/Exploded-View-Search/brt/Bertazzoni	FALSE
Beko	bek	Beko	https://encompass.com/Exploded-View-Search/bek/Beko	FALSE
Blomberg	blm	Blomberg	https://encompass.com/Exploded-View-Search/blm/Blomberg	FALSE
Bosch	bch	Bosch	https://encompass.com/Exploded-View-Search/bch/Bosch	FALSE
Brastemp	whi	Whirlpool	https://encompass.com/Exploded-View-Search/whi/Whirlpool	TRUE
Breville	bre	Breville	https://encompass.com/Exploded-View-Search/bre/Breville	FALSE
Consul	whi	Whirlpool	https://encompass.com/Exploded-View-Search/whi/Whirlpool	TRUE
Criterion	cri	Criterion	https://encompass.com/Exploded-View-Search/cri/Criterion	FALSE
Dacor	dac	Dacor	https://encompass.com/Exploded-View-Search/dac/Dacor	FALSE
Danby	dby	Danby	https://encompass.com/Exploded-View-Search/dby/Danby	FALSE
De'Longhi	dei	De'Longhi	https://encompass.com/Exploded-View-Search/dei/De%27Longhi	FALSE
Elica	eli	Elica	https://encompass.com/Exploded-View-Search/eli/Elica	FALSE
Electrolux	fri	Electrolux	https://encompass.com/Exploded-View-Search/fri/Electrolux	FALSE
Element	ele	Element	https://encompass.com/Exploded-View-Search/ele/Element	FALSE
Fisher Paykel	fap	Fisher_Paykel	https://encompass.com/Exploded-View-Search/fap/Fisher_Paykel	FALSE
Frigidaire	fri	Electrolux	https://encompass.com/Exploded-View-Search/fri/Electrolux	TRUE
Gaggenau	bch	Bosch	https://encompass.com/Exploded-View-Search/bch/Bosch	TRUE
GE	hot	HotPoint	https://encompass.com/Exploded-View-Search/hot/HotPoint	TRUE
Gibson	fri	Electrolux	https://encompass.com/Exploded-View-Search/fri/Electrolux	TRUE
Haier	hai	Haier	https://encompass.com/Exploded-View-Search/hai/Haier	FALSE
Hestan	HES	Hestan	https://encompass.com/Exploded-View-Search/HES/Hestan	FALSE
Hotpoint	hot	HotPoint	https://encompass.com/Exploded-View-Search/hot/HotPoint	TRUE
IKEA	ikea	IKEA	https://encompass.com/Exploded-View-Search/ikea/IKEA	FALSE
Indesit	whi	Whirlpool	https://encompass.com/Exploded-View-Search/whi/Whirlpool	TRUE
Jennair	whi	Whirlpool	https://encompass.com/Exploded-View-Search/whi/Whirlpool	TRUE
Kelvinator	fri	Electrolux	https://encompass.com/Exploded-View-Search/fri/Electrolux	TRUE
Kenmore	kmr	Kenmore	https://encompass.com/Exploded-View-Search/kmr/Kenmore	FALSE
KitchenAid	whi	Whirlpool	https://encompass.com/Exploded-View-Search/whi/Whirlpool	TRUE
LG	lge	LG	https://encompass.com/Exploded-View-Search/lge/LG	FALSE
Liebherr	lie	Liebherr	https://encompass.com/Exploded-View-Search/lie/Liebherr	FALSE
Magic Chef	mac	MagicChef	https://encompass.com/Exploded-View-Search/mac/MagicChef	FALSE
Maytag	may	Maytag	https://encompass.com/Exploded-View-Search/may/Maytag	FALSE
Middleby	mby	Middleby	https://encompass.com/Exploded-View-Search/mby/Middleby	FALSE
Midea	MID	Midea	https://encompass.com/Exploded-View-Search/MID/Midea	FALSE
Miele	MIE	Miele	https://encompass.com/Exploded-View-Search/MIE/Miele	FALSE
Monogram	hot	HotPoint	https://encompass.com/Exploded-View-Search/hot/HotPoint	TRUE
Philco	fri	Electrolux	https://encompass.com/Exploded-View-Search/fri/Electrolux	TRUE
Samsung	smg	Samsung	https://encompass.com/Exploded-View-Search/smg/Samsung	FALSE
Sharp	sha	Sharp	https://encompass.com/Exploded-View-Search/sha/Sharp	FALSE
Silhouette	sil	Silhouette	https://encompass.com/Exploded-View-Search/sil/Silhouette	FALSE
Smeg	sgg	Smeg	https://encompass.com/Exploded-View-Search/sgg/Smeg	FALSE
Speed Queen	SPQ	Speed-Queen	https://encompass.com/Exploded-View-Search/SPQ/Speed-Queen	FALSE
Tappan	fri	Electrolux	https://encompass.com/Exploded-View-Search/fri/Electrolux	TRUE
Thermador	bch	Bosch	https://encompass.com/Exploded-View-Search/bch/Bosch	TRUE
Viking	vik	Viking	https://encompass.com/Exploded-View-Search/vik/Viking	FALSE
Vulcan	vul	Vulcan	https://encompass.com/Exploded-View-Search/vul/Vulcan	FALSE
Whirlpool	whi	Whirlpool	https://encompass.com/Exploded-View-Search/whi/Whirlpool	FALSE
White-Westinghouse	fri	Electrolux	https://encompass.com/Exploded-View-Search/fri/Electrolux	TRUE
Yummly	whi	Whirlpool	https://encompass.com/Exploded-View-Search/whi/Whirlpool	TRUE`;

const lines = data.split('\n').slice(1);
const routes = lines.map(line => {
    const [brand, abv, target_brand, exploded_view_search_url, is_alias_or_rollup] = line.split('\t');
    return {
        brand,
        code: abv.toLowerCase(),
        regularPrefix: abv.toUpperCase(),
        explodedViewBaseUrl: exploded_view_search_url,
        isAlias: is_alias_or_rollup === 'TRUE'
    };
});

console.log(JSON.stringify(routes, null, 2));
